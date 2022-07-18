import { createClient, RedisClientType } from "redis";
import { RelayJsonRpc } from "@walletconnect/relay-api";
import { Logger } from "pino";
import { generateChildLogger } from "@walletconnect/logger";
import { safeJsonParse, safeJsonStringify } from "@walletconnect/safe-json";

import { redisMessageHash, sha256 } from "./utils";
import { HttpService } from "./http";
import { REDIS_CONTEXT, REDIS_NOTIFICATION_MAX_SIZE } from "./constants";
import { OnCallback, Notification } from "./types";

export class RedisService {
  public client: RedisClientType;
  public publisher: RedisClientType;
  public subscriber: RedisClientType;
  public context = REDIS_CONTEXT;
  public streamIds = new Map<string, string>();

  constructor(public server: HttpService, public logger: Logger) {
    this.server = server;
    this.client = createClient({ url: this.server.config.redis.url });
    this.publisher = this.client.duplicate();
    this.subscriber = this.client.duplicate();
    this.logger = generateChildLogger(logger, this.context);
    this.initialize();
  }

  public async setMessage(params: RelayJsonRpc.PublishParams): Promise<void> {
    const { topic, message, ttl } = params;
    this.logger.debug(`Setting Message`);
    const key = redisMessageHash(topic, message);
    await this.client.sAdd(`topic:${topic}`, key);
    await this.client.set(key, message, { EX: ttl });
    this.logger.trace({ type: "method", method: "setMessage", key, params });
  }

  public async getMessage(key: string): Promise<string | null> {
    this.logger.debug(`Getting Message`);
    this.logger.trace({ type: "method", method: "getMessage", key });
    return await this.client.get(key);
  }

  public async getMessages(topic: string): Promise<string[]> {
    this.logger.debug(`Getting Messages`);
    const messages: string[] = [];
    for (const hash of await this.getHashes(topic)) {
      const m = await this.client.get(hash);
      if (m) {
        messages.push(m);
      } else {
        // If the message is null we can remove it from the topic set
        await this.deleteMessage(topic, hash);
      }
    }
    this.logger.trace({ type: "method", method: "getMessages", topic, messages });
    return messages;
  }

  public async getHashes(topic: string): Promise<string[]> {
    this.logger.debug(`Getting Hashes`);
    const hashes: string[] = [];
    for (const hash of await this.client.sMembers(`topic:${topic}`)) {
      hashes.push(hash);
    }
    this.logger.trace({ type: "method", method: "getHashes", topic, hashes });
    return hashes;
  }

  public async deleteMessage(topic: string, hash: string): Promise<void> {
    this.logger.debug(`Deleting Message`);
    this.logger.trace({ type: "method", method: "deleteMessage", topic });
    await this.client.del(hash);
    await this.client.sRem(topic, hash);
  }

  public async setNotification(notification: Notification): Promise<void> {
    this.logger.debug(`Setting Notification`);
    this.logger.trace({
      type: "method",
      method: "setNotification",
      notification,
    });
    const key = `notification:${notification.topic}`;
    await this.client.lPush(key, safeJsonStringify(notification));
    await this.client.lTrim(key, 0, REDIS_NOTIFICATION_MAX_SIZE - 1);
  }

  public async getNotification(topic: string): Promise<Notification[]> {
    const result = await this.client.lRange(`notification:${topic}`, 0, -1);
    const notifications: Notification[] = [];
    if (typeof result !== "undefined" && result.length) {
      result.forEach((item: string) => {
        const notification = safeJsonParse(item);
        notifications.push(notification);
      });
    }
    this.logger.debug(`Getting Notification`);
    this.logger.trace({
      type: "method",
      method: "getNotification",
      topic,
      notifications,
    });
    return notifications;
  }

  public async setPendingRequest(topic: string, id: number, message: string): Promise<void> {
    const key = `pending:${id}`;
    const hash = sha256(message);
    const val = `${topic}:${hash}`;
    this.logger.debug(`Setting Pending Request`);
    this.logger.trace({
      type: "method",
      method: "setPendingRequest",
      topic,
      id,
      message,
    });
    await this.client.set(key, val);
    await this.client.expire(key, this.server.config.maxTTL);
  }

  public async getPendingRequest(id: number): Promise<string | null> {
    this.logger.debug(`Getting Pending Request`);
    const data = await this.client.get(`pending:${id}`);
    this.logger.trace({
      type: "method",
      method: "getPendingRequest",
      id,
      data,
    });
    return data;
  }

  public async deletePendingRequest(id: number): Promise<void> {
    this.logger.debug(`Deleting Pending Request`);
    this.logger.trace({ type: "method", method: "deletePendingRequest", id });
    await this.client.del(`pending:${id}`);
  }

  public on(topic: string, callback: OnCallback): Promise<void> {
    return this.subscriber.subscribe(topic, (payload: string) => callback(JSON.parse(payload)));
  }

  public emit(topic: string, message: {}): Promise<number> {
    return this.publisher.publish(topic, JSON.stringify(message));
  }

  public async setAuth(nonce: string, clientId: string): Promise<void> {
    this.logger.debug(`Setting Auth for nonce ${nonce}`);
    this.logger.trace({ nonce, clientId });
    const key = `nonce:${nonce}`;
    await this.client.set(key, clientId);
    await this.client.expire(key, 300);
  }

  public async getAuth(nonce: string): Promise<string | null> {
    this.logger.debug(`Getting Message for nonce ${nonce}`);
    const key = `nonce:${nonce}`;
    return await this.client.get(key);
  }

  // ---------- Private ----------------------------------------------- //

  private initialize(): void {
    this.client.on("error", (e) => {
      this.logger.error(e);
    });
    this.client.connect();
    this.subscriber.connect();
    this.publisher.connect();
    this.client.on("ready", () => {
      this.logger.trace("Initialized");
    });
  }
}
