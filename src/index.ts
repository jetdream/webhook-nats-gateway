/* eslint-disable no-constant-condition */
/* eslint-disable no-process-exit */
/* eslint-disable quotes */
/* eslint-disable prettier/prettier */
require('dotenv').config();
import { ConnectionOptions } from 'nats';
import { GatewayService, GatewayServiceConfig } from './GatewayService';

import { WebhookCommandProcessor, WebhookCommandProcessorConfig } from './CommandProcessor';
import { WebhookServer, WebHookServerConfig } from './WebhookServer';
import { envBool, envInt, envStr } from './utils';

// Gateway parameters
const SERVICE_ID = envStr('SERVICE_ID', 'will be used to identify the gateway in the NATS server and origin of the messages');
const ALLOW_CREATE_SERVICE_STREAM = envBool('ALLOW_CREATE_SERVICE_STREAM', 'Allowed to create service stream');
const SERVICE_FAILURES_LIMIT = envInt('SERVICE_FAILURES_LIMIT', 'Service failures limit');
const HEALTH_ENDPOINT = envStr('HEALTH_ENDPOINT', 'health endpoint');
const NATS_SERVERS_CONFIG = envStr('NATS_SERVERS_CONFIG', 'NATS servers configuration');

// Webhook general parameters
const LISTEN_PORT = envInt('LISTEN_PORT', 'listen port');

// Webhook service-specific parameters
const WEBHOOK_ENDPOINT = envStr('WEBHOOK_ENDPOINT', 'Root webhook endpoint');


async function main() {
  while (true) {

    const connectionOptions: ConnectionOptions = {
      name: SERVICE_ID,
      servers: NATS_SERVERS_CONFIG?.split(',') || [],
    };

    const commandProcessorConfig: WebhookCommandProcessorConfig = {
      service: SERVICE_ID,
    };
    const messageProcessor = new WebhookCommandProcessor(commandProcessorConfig);

    const gatewayServiceConfig: GatewayServiceConfig = {
      failuresLimit: SERVICE_FAILURES_LIMIT,
      serviceId: SERVICE_ID,
      allowCreateServiceStream: ALLOW_CREATE_SERVICE_STREAM
    }
    const gatewayService = new GatewayService(gatewayServiceConfig, connectionOptions, messageProcessor);
    await gatewayService.start();

    const webhookServerConfig: WebHookServerConfig = {
      port: LISTEN_PORT,
      service: SERVICE_ID,
      webhookEndpoint: WEBHOOK_ENDPOINT,
      healthEndpoint: HEALTH_ENDPOINT,
    };

    const webhookServer = new WebhookServer(
      webhookServerConfig,
      gatewayService,
      gatewayService.getJetStreamClient()
    );

    await webhookServer.start();

    await gatewayService.notifyServiceStarted();

    process.removeAllListeners('SIGINT');
    process.on('SIGINT', async () => {
      // wait for 30 seconds before exiting forcefully
      setTimeout(() => {
        console.log('Exiting forcefully');
        process.exit(1);
      }, 30000);

      console.log('Received SIGINT');
      await webhookServer.stop();
      await gatewayService.stop();
      process.exit();
    });

    console.log('Everything is up and running');
    await gatewayService.waitUntilTerminated();
    await webhookServer.stop();

    if (gatewayService.stopped) break;
  }

}

main();
