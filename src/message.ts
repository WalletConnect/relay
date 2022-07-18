import { Logger } from "pino";
import { RelayJsonRpc } from "@walletconnect/relay-api";
import { generateChildLogger } from "@walletconnect/logger";
import { SIX_HOURS } from "@walletconnect/time";

import { redisMessageHash } from "./utils";
import { HttpService } from "./http";
import { Subscription } from "./types";
import {
  EMPTY_SOCKET_ID,
  MESSAGE_CONTEXT,
  MESSAGE_RETRIAL_MAX,
  MESSAGE_RETRIAL_TIMEOUT,
  PUB_SUB_TOPIC,
} from "./constants";
import { JsonRpcRequest } from "@walletconnect/jsonrpc-types";
import { formatJsonRpcRequest } from "@walletconnect/jsonrpc-utils";

export class MessageService {
  public context = MESSAGE_CONTEXT;

  private timeout = new Map<number, { counter: number; timeout: NodeJS.Timeout }>();

  constructor(public server: HttpService, public logger: Logger) {
    this.server = server;
    this.logger = generateChildLogger(logger, this.context);
    this.initialize();
  }

  public async setMessage(
    params: RelayJsonRpc.PublishParams,
    socketId = EMPTY_SOCKET_ID,
  ): Promise<void> {
    const message = await this.server.redis.getMessage(
      redisMessageHash(params.topic, params.message),
    );
    if (!message) {
      await this.server.redis.setMessage(params);
      this.server.redis.emit(PUB_SUB_TOPIC.messages.added, { params, socketId });
    }
  }

  public async getMessages(topic: string): Promise<string[]> {
    return this.server.redis.getMessages(topic);
  }

  public async pushMessage(subscription: Subscription, message: string): Promise<void> {
    const request = formatJsonRpcRequest<RelayJsonRpc.SubscriptionParams>(
      subscription.jsonrpcMethod,
      {
        id: subscription.id,
        data: {
          topic: subscription.topic,
          message,
        },
      },
    );

    await this.server.redis.setPendingRequest(subscription.topic, request.id, message);
    const success = this.server.ws.send(subscription.socketId, request);
    if (success) this.setTimeout(subscription.socketId, request);
  }

  public async ackMessage(id: number): Promise<void> {
    const pending = await this.server.redis.getPendingRequest(id);
    if (pending) {
      await this.server.redis.deletePendingRequest(id);
      this.deleteTimeout(id);
    }
  }

  // ---------- Private ----------------------------------------------- //

  private initialize(): void {
    this.logger.trace(`Initialized`);
  }

  private setTimeout(socketId: string, request: JsonRpcRequest) {
    if (this.timeout.has(request.id)) return;
    const timeout = setTimeout(() => this.onTimeout(socketId, request), MESSAGE_RETRIAL_TIMEOUT);
    this.timeout.set(request.id, { counter: 1, timeout: timeout as any });
  }

  private async onTimeout(socketId: string, request: JsonRpcRequest) {
    const record = this.timeout.get(request.id);
    if (typeof record === "undefined") return;
    const counter = record.counter + 1;
    if (counter < MESSAGE_RETRIAL_MAX) {
      const success = this.server.ws.send(socketId, request);
      if (success) {
        this.timeout.set(request.id, { counter, timeout: record.timeout });
      } else {
        // if failed considered acknowledged
        await this.ackMessage(request.id);
      }
    } else {
      // stop trying and consider as acknowledged
      await this.ackMessage(request.id);
    }
  }

  private deleteTimeout(id: number): void {
    if (!this.timeout.has(id)) return;
    const record = this.timeout.get(id);
    if (typeof record === "undefined") return;
    clearTimeout(record.timeout);
  }
}
