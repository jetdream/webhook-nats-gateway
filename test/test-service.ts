/* eslint-disable prettier/prettier */
require('dotenv').config();
import { connect, JetStreamClient, JetStreamManager, NatsConnection } from 'nats';

import { envStr } from '../src/utils';
import { v4 as uuidv4 }  from 'uuid';

// Gateway parameters
const NATS_SERVERS_CONFIG = envStr('NATS_SERVERS_CONFIG', 'NATS servers configuration');


async function test() {
  const conn: NatsConnection = await connect({ servers: NATS_SERVERS_CONFIG.split(',') });
  const jsm: JetStreamManager = await conn.jetstreamManager();
  const js: JetStreamClient | null = conn.jetstream();

  const publish = async (subject: string, data: any) => {
    try {
      data = data ?? {};
      data = {
        id: uuidv4(),
        origin: 'another-service',
        timestamp: +new Date(),
        ...data,
      };
      await js!.publish(subject, JSON.stringify(data));
    } catch (err) {
      throw new Error('Error publishing message to NATS');
    }
  }

  const tests = {
    sendMessage: async () => {
      // send template message
      await publish('whatsapp.command.message.send',
        {
          payload: {
            phone_id: "342892832232073",
            message: {
              "messaging_product": "whatsapp",
              "recipient_type": "individual",
              "to": "14083865322",
              "type": "text",
              "text": {
                body: "1Hello from Webhook NATS Gateway"
              }
            }
          }
        }
      );
    },
    resume: async () => {
      await publish('whatsapp-15556116543-test.command.service.resume',
        {
        }
      );
    },
    discovery: async () => {
      await publish('services.discovery',
        {
        }
      );
    }
  }

  const firstArgument = process.argv[2] as keyof typeof tests;
  if (!firstArgument) {
    console.error('Please provide a test name');
    process.exit(1);
  }

  const asyncFunc = tests[firstArgument] as () => Promise<void>;
  await asyncFunc();


  console.log('Executed successfully! '+firstArgument);
  await conn.drain();
  process.exit(0);

}

test();
