import { RequestGenericInterface } from "fastify";
export interface HttpServiceConfig {
  logger: string;
  port: number;
  host: string;
  redis: {
    url: string;
  };
  maxTTL: number;
  gitHash: string;
  version: any;
  prettyPrint: number;
  requiredParams: {
    projectId: boolean;
    clientId: boolean;
  };
  throttle: {
    messages: number;
    interval: number;
  };
}

export interface PostSubscribeRequest extends RequestGenericInterface {
  Body: {
    topic: string;
    webhook: string;
  };
}

export interface GetAuthNonceRequest extends RequestGenericInterface {
  Querystring: {
    did: string;
  };
}

export interface GetWebsocketHandshakeRequest extends RequestGenericInterface {
  Querystring: {
    projectId: string;
    auth: string;
  };
}
