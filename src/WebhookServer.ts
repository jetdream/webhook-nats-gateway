/* eslint-disable prettier/prettier */
import bodyParser from 'body-parser';
import express, { Application } from 'express';
import { IEventPublisher, WebhookEvent } from './types';

export interface WebHookServerConfig {
  service: string;
  port: number;
  webhookEndpoint: string;
  healthEndpoint: string;
}

export class WebhookServer {
  private app: Application = express();
  private server: any = null;

  constructor(
    private config: WebHookServerConfig,
    private eventPublisher: IEventPublisher,
  ) {

    this.app.set('port', this.config.port);
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({extended: true}));
    this.app.get(this.config.healthEndpoint, (req: any, res: any) => {
      res.send('Ok');
    });

    // Main webhook endpoint
    this.app.post(this.config.webhookEndpoint+'*', async (req: any, res: any) => {

      if (process.env.NODE_ENV === 'development') {
        console.warn(JSON.stringify(req.body, null, 2));
      }

      // get expressjs content typpe
      const contentType = req.get('Content-Type');

      try {

        const message: WebhookEvent = {
          type: 'WebhookEvent',
          typeVersion: '1',
          payload: {
            url: req.url,
            method: req.method,
            contentType,
            body: req.body,
          }
        };

        const lastUrlSection = req.url.split('/').pop();
        const subjectEventWebhook = `${this.config.service}.event.${lastUrlSection}.received`;

        await this.eventPublisher.publish(subjectEventWebhook, message);

        res.sendStatus(200);
      } catch (err) {
        console.error('Error publishing message to NATS:', err);
        res.sendStatus(500);
      }

    });
  }

  getEventsToPublish(): string[] {
    return [`${this.config.service}.event.*.received`];
  }

  start() {
    this.server = this.app.listen(this.app.get('port'), () => {
      console.log('WebhookServer started:');
      console.log('  - Port: ', this.app.get('port'));
      console.log('  - Webhook endpoint: ', this.config.webhookEndpoint);
    });

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
