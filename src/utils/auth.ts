import { decodeJWT } from "@walletconnect/relay-auth";
import { FastifyRequest } from "fastify";

import { GetWebsocketHandshakeRequest } from "../types";
import { generateRandomBytes32 } from "./misc";

export function getAuthFromRequest(
  req: FastifyRequest<GetWebsocketHandshakeRequest>,
): string | undefined {
  const authHeader = req.headers.authorization;
  const authParam = req.query.auth;

  const isAuthProvided = !!authHeader || !!authParam;

  // TODO #65: Require auth
  if (!isAuthProvided) return;

  const jwt = authHeader ? authHeader.toLowerCase().replace("bearer ", "") : authParam!;
  return jwt;
}

export function getClientIdFromRequest(req: FastifyRequest<GetWebsocketHandshakeRequest>): string {
  const jwt = getAuthFromRequest(req);
  // TODO #65: Require auth (generate random unique id without jwt)
  if (typeof jwt === "undefined") return generateRandomBytes32();
  return decodeJWT(jwt).payload.iss;
}
