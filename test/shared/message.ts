import { RELAY_JSONRPC, RelayJsonRpc } from "@walletconnect/relay-api";
import { formatJsonRpcRequest, JsonRpcRequest } from "@walletconnect/jsonrpc-utils";

import { generateRandomBytes32 } from "../../src/utils";

import { TEST_MESSAGE } from "./values";

export interface TestJsonRpcPayloads {
  topic: string;
  pub: JsonRpcRequest<RelayJsonRpc.PublishParams>;
  sub: JsonRpcRequest<RelayJsonRpc.SubscribeParams>;
}

export function getTestJsonRpc(
  message = TEST_MESSAGE,
  overrideTopic?: string,
): TestJsonRpcPayloads {
  const topic = overrideTopic || generateRandomBytes32();

  const pub = formatJsonRpcRequest<RelayJsonRpc.PublishParams>(RELAY_JSONRPC.iridium.publish, {
    topic,
    message,
    ttl: 86400,
  });

  const sub = formatJsonRpcRequest<RelayJsonRpc.SubscribeParams>(RELAY_JSONRPC.iridium.subscribe, {
    topic,
  });
  return { topic, pub, sub };
}
