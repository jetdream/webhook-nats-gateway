/* eslint-disable prettier/prettier */
import bodyParser from 'body-parser';
import express, { Application, NextFunction } from 'express';
import { IEventPublisher, WebhookEvent } from './types';
import { JetStreamClient, JSONCodec, KV } from 'nats';
import { v4 as uuidv4 } from 'uuid';
import { TimeoutError, waitForJSMessage } from './libs/connectivity';
import { Request, Response } from 'express';

export interface WebHookServerConfig {
  service: string;
  port: number;
  webhookEndpoint: string;
  healthEndpoint: string;
}

type EndpointDescriptor = {
  type: 'request' | 'event',
  // transport: 'JetStream' | 'NATS',
  entity: string, // webhook.{event|request}.{entity}.received
  allowedOrigins?: string[],
  timeout?: number,
  maxSize?: number,
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE')[]
}

export class WebhookServer {
  private app: Application = express();
  private server: any = null;
  private webEndpoints!: KV;

  constructor(
    private config: WebHookServerConfig,
    private eventPublisher: IEventPublisher,
    private jetStreamClient: JetStreamClient
  ) {

    this.app.set('port', this.config.port);
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({extended: true}));
    this.app.get(this.config.healthEndpoint, (req: any, res: any) => {
      res.send('Ok');
    });

    /*
      webEndpoints KV bucket stores the webhook endpoints EndpointDescriptor as JSON objects
      keys represent the endpoint path where '/' is replaced by '.'

      Received requests are checked against the endpoint descriptor to determine
      - if the request is allowed
      - if the request origin is allowed

      If it is an event endpoint, the event is published to the JetStream subject '{service}.event.{entity}.received' and the response is 200
      If it is a request endpoint, the request is published to the JetStream subject '{service}.request.{entity}.received' with included requestId in the payload
        it subscribes to the response subject '{service}.response.{entity}.send.{requestId}' to send the response back to the client

    */

    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        let path = req.path;
        // remove trailing and leading slashes
        path = path.replace(/^\/+|\/+$/g, '');
        const key = path.replace(/\//g, '.');

        let endpointDescriptor
        try {
          endpointDescriptor = await this.webEndpoints.get(key);
        } catch (err) {
          console.error('Error getting endpoint descriptor:', err);
        }

        if (!endpointDescriptor || !endpointDescriptor.length) {
          res.sendStatus(404); // Not Found
          return;
        }

        const descriptor = JSONCodec().decode(endpointDescriptor.value) as EndpointDescriptor;

        // check for origins including '*'
        if (descriptor.allowedOrigins && descriptor.allowedOrigins.length > 0) {
          const origin = req.get('Origin')?.toLowerCase();
          if (origin && !descriptor.allowedOrigins.includes(origin) && !descriptor.allowedOrigins.includes('*')) {
            res.sendStatus(403); // Forbidden
            return;
          }
        }

        // check for allowed methods
        if (!descriptor.methods.includes(req.method as any)) {
          res.sendStatus(405); // Method Not Allowed
          return;
        }

        if (descriptor.maxSize && req.body && Buffer.byteLength(JSON.stringify(req.body)) > descriptor.maxSize) {
          res.sendStatus(413); // Payload Too Large
          return;
        }

        const contentType = req.get('Content-Type');

        if (descriptor.type === 'event') {
          const subjectEventWebhook = `${this.config.service}.event.${descriptor.entity}.received`;

          try {
            const message: WebhookEvent = {
              type: 'WebhookEvent',
              typeVersion: '1',
              payload: {
                url: req.url,
                method: req.method,
                body: req.body,
                contentType,
                headers: req.headers as any
              }
            };

            await this.eventPublisher.publish(subjectEventWebhook, message);

            res.sendStatus(200);
          } catch (err) {
            console.error('Error publishing message to JetStream:', err);
            res.sendStatus(500);
          }
        } else if (descriptor.type === 'request') {
          const requestId = uuidv4();
          const subjectRequestWebhook = `${this.config.service}.request.${descriptor.entity}.received`;
          const subjectResponseWebhook = `${this.config.service}.response.${descriptor.entity}.send.${requestId}`;

          try {
            const message: WebhookEvent = {
              type: 'WebhookEvent',
              typeVersion: '1',
              requestId,
              payload: {
                url: req.url,
                method: req.method,
                body: req.body,
                contentType,
                headers: req.headers as any
              }
            };

            // setup consumer
            const waitPromise = await waitForJSMessage(this.jetStreamClient, subjectResponseWebhook, descriptor.timeout ?? 30000);

            // now publish the request
            await this.eventPublisher.publish(subjectRequestWebhook, message);

            // wait for response
            const response = (await waitPromise.promise) || {} as any;

            res.status(200).json(response.payload);


          } catch (err) {

            console.error('Error:', err);

            if (err instanceof TimeoutError) {
              res.sendStatus(504); // Gateway Timeout
            } else {
              res.sendStatus(500); // Internal Server Error
            }
          }
        }
      } catch (err) {
        console.error('Error processing request:', err);
        res.sendStatus(500); // Internal Server Error
      }

    });

  }


  getEventsToPublish(): string[] {
    return [`${this.config.service}.event.*.received`];
  }

  async start() {
    this.server = this.app.listen(this.app.get('port'), () => {
      console.log('WebhookServer started:');
      console.log('  - Port: ', this.app.get('port'));
      console.log('  - Webhook endpoint: ', this.config.webhookEndpoint);
    });

    this.webEndpoints = await this.jetStreamClient.views.kv('web_endpoints');
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.server.close(() => {
        console.log('WebhookServer stopped');
        resolve();
      });
    });
  }
}
