import os from 'os';
import {DeliverPolicy, JetStreamClient, OrderedConsumerOptions} from 'nats';

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

export async function waitForJSMessage<T>(
  jetStreamClient: JetStreamClient,
  subject: string,
  timeout: number
): Promise<{promise: Promise<T>}> {
  const options: Partial<OrderedConsumerOptions> = {
    filterSubjects: [subject],
    deliver_policy: DeliverPolicy.New,
  };

  const streamName = await (
    await jetStreamClient.jetstreamManager()
  ).streams.find(subject);
  if (!streamName) {
    throw new Error(`Stream for ${subject} not found`);
  }

  const consumer = await jetStreamClient.consumers.get(streamName, options);
  const messages = await consumer.consume();

  // wait for 'crm.event.graphql.executed' event for 10 seconds using a combination of timer and promise

  return {
    promise: new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        consumer.delete().then(() => {
          reject(new TimeoutError('Timeout waiting for event'));
        });
      }, timeout);

      (async () => {
        for await (const message of messages) {
          if (!message.data) continue;

          clearTimeout(timer);
          message.ack();
          let data;
          try {
            data = message.json();
          } catch (e) {
            reject(e);
          }

          await consumer.delete();
          resolve(data as T);

          break;
        }
      })().catch(reject);
    }),
  };
}


export function getLocalIP() {
  const interfaces = os.networkInterfaces();
  if (!interfaces) {
    throw new Error('No network interfaces found');
  }

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (!iface) continue;
      // Skip over non-IPv4 and internal (i.e., 127.0.0.1) addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  throw new Error('No external IP address found');
}
