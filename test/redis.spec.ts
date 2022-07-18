import "mocha";
import pino from "pino";
import { getDefaultLoggerOptions } from "@walletconnect/logger";
import { expect } from "chai";

import { redisMessageHash, generateRandomBytes32 } from "../src/utils";

import config from "../src/config";
import { HttpService } from "../src/http";
import { Notification } from "../src/types";

import { RedisService } from "../src/redis";
import { ONE_DAY } from "@walletconnect/time";

import { TEST_MESSAGE, TEST_TOPIC } from "./shared";
import { REDIS_NOTIFICATION_MAX_SIZE } from "../src/constants";

describe("Redis", () => {
  let redis: RedisService;
  before(() => {
    const http = new HttpService(config);
    const logger = pino(getDefaultLoggerOptions({ level: "fatal" }));
    redis = new RedisService(http, logger);
  });
  it("setMessage", async () => {
    const params = {
      topic: TEST_TOPIC,
      message: TEST_MESSAGE,
      ttl: ONE_DAY,
    };
    await redis.setMessage(params);
    const result = await redis.client.TTL(redisMessageHash(params.topic, params.message));
    expect(result).to.be.lte(params.ttl);
    expect(result).to.be.gte(params.ttl - 1); // One second less
  });
  it("Gets a single message from redis", async () => {
    for (let i = 0; i < 250; i++) {
      await redis.setMessage({
        topic: TEST_TOPIC,
        message: generateRandomBytes32(),
        ttl: ONE_DAY,
      });
    }
    const params = {
      topic: TEST_TOPIC,
      message: generateRandomBytes32(),
      ttl: ONE_DAY,
    };
    await redis.setMessage(params);
    expect(await redis.getMessage(redisMessageHash(params.topic, params.message))).to.equal(
      params.message,
    );
  });
  it("Non-existing message is null", async () => {
    const params = {
      topic: TEST_TOPIC,
      message: generateRandomBytes32(),
      ttl: ONE_DAY,
    };
    expect(await redis.getMessage(redisMessageHash(params.topic, params.message))).to.be.null;
  });
  it("Message gets deleted", async () => {
    for (let i = 0; i < 200; i++) {
      await redis.setMessage({
        topic: TEST_TOPIC,
        message: generateRandomBytes32(),
        ttl: ONE_DAY,
      });
    }
    const testMessage = {
      topic: TEST_TOPIC,
      message: generateRandomBytes32(),
      ttl: ONE_DAY,
    };
    await redis.setMessage(testMessage);
    let message = await redis.getMessage(redisMessageHash(testMessage.topic, testMessage.message));
    expect(message).to.equal(testMessage.message);
    await redis.deleteMessage(TEST_TOPIC, redisMessageHash(testMessage.topic, testMessage.message));
    message = await redis.getMessage(redisMessageHash(testMessage.topic, testMessage.message));
    expect(message).to.be.null;
  });
  it("Notification list gets truncated", async function () {
    const notifications: Notification[] = [];
    const topic = TEST_TOPIC;
    Array.from(Array(REDIS_NOTIFICATION_MAX_SIZE * 2)).map(async () => {
      const webhook = generateRandomBytes32();
      notifications.push({ topic, webhook });
      await redis.setNotification({ topic, webhook });
    });

    let redisItems: Notification[] = [];
    await new Promise<void>((resolve) => {
      setTimeout(async function () {
        redisItems = await redis.getNotification(TEST_TOPIC);
        resolve();
      }, 100);
    });
    const expected = notifications.slice(REDIS_NOTIFICATION_MAX_SIZE, notifications.length);
    expect(redisItems).to.have.length(expected.length);
    expect(redisItems).to.have.deep.members(expected);
  });
});
