import { generateKeyPair, signJWT } from "@walletconnect/relay-auth";
import { randomBytes } from "crypto";

export const getJWT = async (aud) => {
  const clientIdPair = generateKeyPair();
  const sub = randomBytes(32).toString("hex");
  const ttl = 86400;
  return signJWT(sub, aud, ttl, clientIdPair);
};
