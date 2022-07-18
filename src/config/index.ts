import { SERVER_LOGGER, REDIS_DEFAULT_MAXTTL } from "../constants";
import { HttpServiceConfig } from "../types";

const gitHash = process.env.GITHASH || "0000000";
const version = require("../../package.json").version || "0.0.0";
const logger = (process.env.LOG_LEVEL || "info").toLowerCase();

if (SERVER_LOGGER.levels.indexOf(logger) === -1) {
  throw Error(
    `Wrong log level used: ${process.env.LOG_LEVEL}. Valid levels are: ${SERVER_LOGGER.levels}`,
  );
}

const prettyPrint: number = process.env.PRETTY ? parseInt(process.env.PRETTY, 10) : 0;
export const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
export const host = process.env.HOST || `0.0.0.0`;

const maxTTL: number = process.env.REDIS_MAXTTL
  ? parseInt(process.env.REDIS_MAXTTL, 10)
  : REDIS_DEFAULT_MAXTTL;
const redis = {
  url: process.env.REDIS_URL || `redis://localhost:6379/0`,
};

const requiredParams = {
  clientId: true, // always require
  projectId: !!process.env.REQUIRE_PROJECT_ID || false,
};

const throttle = {
  messages: process.env.MAX_MESSAGES ? parseInt(process.env.MAX_MESSAGES) : 15 * 60, // max socket messages allowed per interval
  interval: process.env.THROTTLE_INTERVAL ? parseInt(process.env.THROTTLE_INTERVAL) : 60, // in seconds
};

const config: HttpServiceConfig = {
  logger,
  port,
  host,
  redis,
  maxTTL,
  gitHash,
  version,
  prettyPrint,
  requiredParams,
  throttle,
};

export default config;
