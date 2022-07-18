import { EventEmitter } from "events";
import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import helmet from "@fastify/helmet";
import ws from "@fastify/websocket";
import pino, { Logger } from "pino";
import { getDefaultLoggerOptions, generateChildLogger } from "@walletconnect/logger";
import client from "prom-client";

import { verifyJWT } from "@walletconnect/relay-auth";
import { getAuthFromRequest, assertType, HttpError } from "./utils";
import { RedisService } from "./redis";
import { WebSocketService } from "./ws";
import { NotificationService } from "./notification";
import { HttpServiceConfig, PostSubscribeRequest, GetWebsocketHandshakeRequest } from "./types";
import {
  METRICS_DURACTION_BUCKETS,
  METRICS_PREFIX,
  SERVER_BEAT_INTERVAL,
  SERVER_CONTEXT,
  SERVER_EVENTS,
} from "./constants";
import { SubscriptionService } from "./subscription";
import { MessageService } from "./message";

export class HttpService {
  public events = new EventEmitter();

  public app: FastifyInstance;
  public logger: Logger;
  public redis: RedisService;
  public ws: WebSocketService;
  public message: MessageService;
  public subscription: SubscriptionService;
  public notification: NotificationService;
  public context = SERVER_CONTEXT;
  public metrics;

  constructor(public config: HttpServiceConfig) {
    let conf = getDefaultLoggerOptions({ level: config.logger });
    if (config.prettyPrint) {
      conf = Object.assign(conf, {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
          },
        },
      });
    }
    const logger = pino(conf);
    this.config = config;
    this.app = fastify({ logger });
    this.logger = generateChildLogger(logger, this.context);
    this.metrics = this.setMetrics();
    this.redis = new RedisService(this, this.logger);
    this.ws = new WebSocketService(this, this.logger);
    this.message = new MessageService(this, this.logger);
    this.subscription = new SubscriptionService(this, this.logger);
    this.notification = new NotificationService(this, this.logger);

    this.initialize();
  }

  public on(event: string, listener: any): void {
    this.events.on(event, listener);
  }

  public once(event: string, listener: any): void {
    this.events.once(event, listener);
  }

  public off(event: string, listener: any): void {
    this.events.off(event, listener);
  }

  public removeListener(event: string, listener: any): void {
    this.events.removeListener(event, listener);
  }

  // ---------- Private ----------------------------------------------- //

  private initialize(): void {
    this.logger.trace(`Initialized`);
    this.registerApi();
    this.setBeatInterval();
  }

  public async validateProjectId(
    req: FastifyRequest<GetWebsocketHandshakeRequest>,
    res: FastifyReply,
  ) {
    try {
      if (this.config.requiredParams.projectId) {
        assertType(req, "query", "object");
        assertType(req.query, "projectId");
        // TODO: actually validate the ID when Cerbrus is available
      }
      return;
    } catch (e) {
      res
        .status((e as HttpError).statusCode)
        .send({ message: `Error: ${(e as HttpError).message}` });
    }
  }

  public async validateAuth(req: FastifyRequest<GetWebsocketHandshakeRequest>, res: FastifyReply) {
    try {
      const jwt = getAuthFromRequest(req);

      if (typeof jwt === "undefined") return; // no jwt provided

      if (await verifyJWT(jwt)) return; // jwt is valid

      throw new HttpError("failed to validate the provided header", 401);
    } catch (e) {
      res
        .status((e as HttpError).statusCode)
        .send({ message: `Error: ${(e as HttpError).message}` });
    }
  }

  private registerApi() {
    this.app.register(helmet);
    this.app.register(ws);
    this.app.addHook(
      "preValidation",
      async (request: FastifyRequest<GetWebsocketHandshakeRequest>, reply: FastifyReply) => {
        if (request.raw.url !== "/") return;
        await this.validateProjectId(request, reply);
        await this.validateAuth(request, reply);
      },
    );
    const server = this; //eslint-disable-line
    this.app.register(async function(fastify) {
      server.ws.websocketHandler(fastify);
    });

    this.app.get("/health", (_, res) => {
      res.status(204).send();
    });

    this.app.get("/hello", (_, res) => {
      this.metrics.hello.inc();
      res
        .status(200)
        .send(`Hello World, this is Relay Server v${this.config.version}@${this.config.gitHash}`);
    });

    this.app.get("/metrics", (_, res) => {
      res.headers({ "Content-Type": this.metrics.register.contentType });
      this.metrics.register.metrics().then((result) => {
        res.status(200).send(result);
      });
    });

    this.app.post<PostSubscribeRequest>("/subscribe", async (req, res) => {
      try {
        assertType(req, "body", "object");
        assertType(req.body, "topic");
        assertType(req.body, "webhook");

        await this.notification.register(req.body.topic, req.body.webhook);

        res.status(200).send({ success: true });
      } catch (e) {
        res
          .status((e as HttpError).statusCode)
          .send({ message: `Error: ${(e as HttpError).message}` });
      }
    });
  }

  private setMetrics() {
    const register = new client.Registry();

    client.collectDefaultMetrics({
      prefix: METRICS_PREFIX,
      register,
      gcDurationBuckets: METRICS_DURACTION_BUCKETS,
    });
    const metrics = {
      register,
      hello: new client.Counter({
        registers: [register],
        name: `${this.context}_hello_counter`,
        help: "shows how much the /hello has been called",
      }),
    };
    return metrics;
  }

  private setBeatInterval() {
    setInterval(() => this.events.emit(SERVER_EVENTS.beat), SERVER_BEAT_INTERVAL);
  }
}
