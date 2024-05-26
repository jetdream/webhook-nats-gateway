/* eslint-disable prettier/prettier */
import { JsMsg, JSONCodec } from "nats";
import { IEventPublisher, IMessageProcessor, IncorrectMessageError } from "./types";
import { RateLimiter } from "./utils";

/* eslint-disable prettier/prettier */

const rateLimiter = new RateLimiter(80, 1); // 80 calls per second

export interface WebhookCommandProcessorConfig {
  service: string;
}

function checkMessageStructure(payload: any): boolean {
  return true;
}

export class WebhookCommandProcessor implements IMessageProcessor{
  private publisher: IEventPublisher | null = null;

  constructor(private config: WebhookCommandProcessorConfig) {
  }

  async init(publisher: IEventPublisher) {
    this.publisher = publisher;
  }

  getSubjectsOfInterest(): string[] {
    //return []
    return [`${this.config.service}.command.configure`];
  }

  async processMessage(msg: JsMsg, data: unknown) {
    if (!checkMessageStructure(data)) {
      throw new IncorrectMessageError();
    }

    // do nothing for now

  }

  async stop() {
    // do nothing for now
  }
}
