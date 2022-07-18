import { Logger } from "pino";
import client from "prom-client";
import { safeJsonParse, safeJsonStringify } from "@walletconnect/safe-json";
import { isJsonRpcPayload, JsonRpcPayload } from "@walletconnect/jsonrpc-utils";
import { generateChildLogger } from "@walletconnect/logger";
import { FastifyInstance, FastifyRequest } from "fastify";
import { SocketStream } from "@fastify/websocket";

import { JsonRpcService } from "./jsonrpc";
import { GetWebsocketHandshakeRequest, Socket } from "./types";

import { generateRandomBytes32, getClientIdFromRequest } from "./utils";

import { HttpService } from "./http";
import { SERVER_EVENTS, WEBSOCKET_CONTEXT, WEBSOCKET_EVENTS } from "./constants";
import { RollingCounter } from "./utils/rollingCounter";

export class WebSocketService {
  public jsonrpc: JsonRpcService;
  public sockets = new Map<string, Socket>();

  public context = WEBSOCKET_CONTEXT;

  private metrics;
  private counters = new Map<string, RollingCounter>();
  private MESSAGES_LIMIT: number;
  private THROTTLE_INTERVAL: number;

  constructor(public server: HttpService, public logger: Logger) {
    this.server = server;
    this.logger = generateChildLogger(logger, this.context);
    this.jsonrpc = new JsonRpcService(this.server, this.logger);
    this.metrics = {
      newConnection: new client.Counter({
        name: `${this.server.context}_${this.context}_new_connections`,
        help: "Sum of opened ws connection",
        registers: [this.server.metrics.register],
      }),
      closeConnection: new client.Counter({
        name: `${this.server.context}_${this.context}_closed_connections`,
        help: "Sum of closed ws connections",
        registers: [this.server.metrics.register],
      }),
      totalMessages: new client.Counter({
        name: `${this.server.context}_${this.context}_messages_total`,
        help: "Total amount of messages",
        registers: [this.server.metrics.register],
      }),
    };
    this.MESSAGES_LIMIT = this.server.config.throttle.messages;
    this.THROTTLE_INTERVAL = this.server.config.throttle.interval;
    this.initialize();
  }

  public send(socketId: string, msg: string | JsonRpcPayload): boolean {
    const socket = this.getSocket(socketId);
    if (typeof socket === "undefined") return false;
    const message = typeof msg === "string" ? msg : safeJsonStringify(msg);
    this.logger.debug(`Outgoing Socket Message`);
    this.logger.trace({ type: "message", direction: "outgoing", message });
    socket.connection.send(message);
    return true;
  }

  public getSocket(socketId: string): Socket | undefined {
    const socket = this.sockets.get(socketId);
    if (typeof socket === "undefined") {
      this.logger.error(`Socket not found with socketId: ${socketId}`);
      return;
    }
    return socket;
  }

  public isSocketConnected(socketId: string): boolean {
    try {
      const socket = this.getSocket(socketId);
      if (typeof socket === "undefined") return false;
      return socket.connection.readyState === 1;
    } catch (e) {
      return false;
    }
  }

  public addNewSocket(
    connection: SocketStream,
    req: FastifyRequest<GetWebsocketHandshakeRequest>,
  ): Socket {
    this.logger.info(`New Socket Connected`);
    const socket: Socket = {
      clientId: getClientIdFromRequest(req),
      connection: connection.socket as any,
      id: generateRandomBytes32(),
    };
    this.logger.debug({ type: "method", method: "addNewSocket", socket });
    this.sockets.set(socket.id, socket);
    return socket;
  }

  public async messageHandler(data: any, socketId: string) {
    this.metrics.totalMessages.inc();
    const message = data.toString();
    this.logger.debug(`Incoming Socket Message`);
    this.logger.trace({ type: "message", direction: "incoming", message });
    if (!message || !message.trim()) {
      this.send(socketId, "Missing or invalid socket data");
      return;
    }
    const payload = safeJsonParse(message);
    if (typeof payload === "string") {
      this.send(socketId, "Socket message is invalid");
    } else if (isJsonRpcPayload(payload)) {
      this.jsonrpc.onPayload(socketId, payload);
    } else {
      this.send(socketId, "Socket message unsupported");
    }

    this.throttle(socketId);
  }

  public closeHandler(socketId: string) {
    this.metrics.closeConnection.inc();
    this.sockets.delete(socketId);
    this.server.events.emit(WEBSOCKET_EVENTS.close, socketId);
  }

  public async websocketHandler(fastify: FastifyInstance): Promise<void> {
    fastify.get<GetWebsocketHandshakeRequest>("/", { websocket: true }, (connection, req) => {
      const socket = this.addNewSocket(connection, req);
      connection.socket.on("message", async (data) => {
        this.messageHandler(data, socket.id);
      });
      connection.socket.on("error", (e: Error) => {
        if (!e.message.includes("Invalid WebSocket frame")) {
          this.logger.fatal(e);
          throw e;
        }
      });
      connection.socket.on("pong", () => {
        socket.connection.isAlive = true;
      });
      connection.socket.on("close", () => {
        this.closeHandler(socket.id);
      });
      this.metrics.newConnection.inc();
    });
  }

  // ---------- Private ----------------------------------------------- //

  private initialize(): void {
    this.logger.trace(`Initialized`);
    this.registerEventListeners();
  }

  private registerEventListeners() {
    this.server.events.on(SERVER_EVENTS.beat, () => this.clearInactiveSockets());
  }

  private clearInactiveSockets() {
    const socketIds = Array.from(this.sockets.keys());
    socketIds.forEach((socketId: string) => {
      const socket = this.sockets.get(socketId);

      if (typeof socket === "undefined") {
        return;
      }
      if (socket.connection.isAlive === false) {
        this.sockets.delete(socketId);
        socket.connection.terminate();
        this.server.events.emit(WEBSOCKET_EVENTS.close, socketId);
        return;
      }

      function noop() {
        // empty
      }

      socket.connection.isAlive = false;
      socket.connection.ping(noop);
    });
  }

  private throttle(socketId: string) {
    let counter = this.counters.get(socketId);

    if (!counter) {
      counter = new RollingCounter({
        limit: this.MESSAGES_LIMIT,
        interval: this.THROTTLE_INTERVAL,
        errorMessage: "Too Many Requests",
      });
    }

    try {
      counter.increment();
    } catch (e) {
      const socket = this.getSocket(socketId);
      if (typeof socket === "undefined") {
        return;
      }
      // send close event to the socket
      socket.connection.close(1013, (e as Error).message);
      // terminate the connection
      process.nextTick(() => {
        socket.connection.terminate();
      });
      this.counters.delete(socketId);
      return;
    }

    this.counters.set(socketId, counter);
  }
}
