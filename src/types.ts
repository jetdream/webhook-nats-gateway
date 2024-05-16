import { JsMsg } from "nats";

export interface WebhookEvent {
  type: 'WebhookEvent';
  typeVersion: string;
  payload: {
    url: string;
    method: string;
    contentType: string;
    body: any;
  };
}

/**
 * Interface for event publishers.
 */
export interface IEventPublisher {
  publish(subject: string, data: any): Promise<void>;
}

export interface IMessageProcessor {
  getSubjectsOfInterest(): string[];
  processMessage(message: JsMsg, data: unknown): Promise<void>;
  init(publisher: IEventPublisher): Promise<void>;
}

export class IncorrectMessageError extends Error {
  errorJson?: any;

  constructor(details?: string, json?: any) {
    super('Incorrect message structure. ' + details);
    this.errorJson = json;
  }
}
