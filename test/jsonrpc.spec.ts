import "mocha";
import { expect } from "chai";
import JsonRpcProvider from "@walletconnect/jsonrpc-provider";
import WsConnection from "@walletconnect/jsonrpc-ws-connection";
import { RELAY_JSONRPC } from "@walletconnect/relay-api";
import { JsonRpcPayload } from "@walletconnect/jsonrpc-types";
import { formatJsonRpcRequest, formatJsonRpcResult } from "@walletconnect/jsonrpc-utils";

import { TEST_RELAY_URL, TEST_WS_URL, getTestJsonRpc, Counter, getJWT } from "./shared";
import { generateRandomBytes32 } from "../src/utils";
import config from "../src/config";

describe("JSON-RPC", () => {
  it("A can publish to B subscribed to same topic", async () => {
    const { topic, pub, sub } = getTestJsonRpc();

    const providerA = new JsonRpcProvider(
      new WsConnection(`${TEST_WS_URL}&auth=${await getJWT(TEST_RELAY_URL)}`),
    );
    await providerA.connect();
    const providerB = new JsonRpcProvider(
      new WsConnection(`${TEST_WS_URL}&auth=${await getJWT(TEST_RELAY_URL)}`),
    );
    await providerB.connect();

    let subscriptionB: string;

    const counterB = new Counter();

    await Promise.all([
      new Promise<void>(async (resolve) => {
        // subscribing to topics
        subscriptionB = await providerB.request(sub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // publishing to topics
        providerA.request(pub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // acknowledging received payloads
        providerB.on("payload", (payload: JsonRpcPayload) => {
          const response = formatJsonRpcResult(payload.id, true);
          providerB.connection.send(response);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        // evaluating incoming subscriptions
        providerB.on("message", ({ type, data }) => {
          counterB.tick();
          expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
          if (subscriptionB) expect(data.id).to.eql(subscriptionB);
          expect(data.data.topic).to.eql(pub.params.topic);
          expect(data.data.message).to.eql(pub.params.message);
          resolve();
        });
      }),
    ]);

    expect(counterB.value).to.eql(1);
  });
  it("A can publish to B and C subscribed to same topic", async () => {
    const { pub, sub } = getTestJsonRpc();

    const providerA = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerA.connect();
    const providerB = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerB.connect();
    const providerC = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerC.connect();

    let subscriptionB: string;
    let subscriptionC: string;

    const counterB = new Counter();
    const counterC = new Counter();

    await Promise.all([
      new Promise<void>(async (resolve) => {
        // subscribing to topics
        subscriptionB = await providerB.request(sub);
        resolve();
      }),
      new Promise<void>(async (resolve) => {
        // subscribing to topics
        subscriptionC = await providerC.request(sub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // publishing to topics
        providerA.request(pub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // acknowledging received payloads
        providerB.on("payload", (payload: JsonRpcPayload) => {
          const response = formatJsonRpcResult(payload.id, true);
          providerB.connection.send(response);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        // evaluating incoming subscriptions
        providerB.on("message", ({ type, data }) => {
          counterB.tick();
          expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
          if (subscriptionB) expect(data.id).to.eql(subscriptionB);
          expect(data.data.topic).to.eql(pub.params.topic);
          expect(data.data.message).to.eql(pub.params.message);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        // acknowledging received payloads
        providerC.on("payload", (payload: JsonRpcPayload) => {
          const response = formatJsonRpcResult(payload.id, true);
          providerC.connection.send(response);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        // evaluating incoming subscriptions
        providerC.on("message", ({ type, data }) => {
          counterC.tick();
          expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
          if (subscriptionC) expect(data.id).to.eql(subscriptionC);
          expect(data.data.topic).to.eql(pub.params.topic);
          expect(data.data.message).to.eql(pub.params.message);
          resolve();
        });
      }),
    ]);
    expect(counterB.value).to.eql(1);
    expect(counterC.value).to.eql(1);
  });
  it("A can publish to B through Provider A to Provider B", async function () {
    const { pub, sub } = getTestJsonRpc(generateRandomBytes32());

    const providerA = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerA.connect();
    const providerB = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerB.connect();

    let subscriptionB: string;

    const counterB = new Counter();

    await Promise.all([
      new Promise<void>(async (resolve) => {
        // subscribing to topics
        subscriptionB = await providerB.request(sub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // publishing to topics
        providerA.request(pub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // acknowledging received payloads
        providerB.on("payload", (payload: JsonRpcPayload) => {
          const response = formatJsonRpcResult(payload.id, true);
          providerB.connection.send(response);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        // evaluating incoming subscriptions
        providerB.on("message", ({ type, data }) => {
          counterB.tick();
          expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
          if (subscriptionB) expect(data.id).to.eql(subscriptionB);
          expect(data.data.topic).to.eql(pub.params.topic);
          expect(data.data.message).to.eql(pub.params.message);
          resolve();
        });
      }),
    ]);

    expect(counterB.value).to.eql(1);
  });
  it("A can publish multiple messages while B is concurrently subscribing", async function () {
    const topic = generateRandomBytes32();
    const { sub } = getTestJsonRpc(generateRandomBytes32(), topic);

    const providerA = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerA.connect();

    const providerB = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerB.connect();

    // N amount
    const amount = 10;

    // acknowledging received payloads
    providerB.on("payload", (payload: JsonRpcPayload) => {
      const response = formatJsonRpcResult(payload.id, true);
      providerB.connection.send(response);
    });

    // generates N messages with index as content
    const sent = Array.from(Array(amount)).map((_, i) => String(i + 1));

    // send N messages to topic
    sent.map((i) => {
      providerA.request(getTestJsonRpc(i, topic).pub);
    });
    // subscribe to topic
    providerB.request(sub);

    const promises: any = [];
    const received: string[] = [];
    await Promise.all([
      await new Promise<void>((resolve) => {
        // evaluating incoming subscriptions
        providerB.on("message", ({ type, data }) => {
          if (type === RELAY_JSONRPC.iridium.subscription && data.data.topic === topic) {
            const content = data.data.message;
            if (!received.includes(content) && sent.includes(content)) {
              received.push(content);
            }
          }
          if (received.length === amount) {
            resolve();
          }
        });
      }),
      // first half
      sent
        .slice(0, sent.length / 2)
        .map((i) => promises.push(providerA.request(getTestJsonRpc(i, topic).pub))),
      // subscribe
      promises.push(providerB.request),
      // second half
      sent
        .slice(sent.length / 2)
        .map((i) => promises.push(providerA.request(getTestJsonRpc(i, topic).pub))),
    ]);

    expect(received.length).to.eql(amount);
  });

  it("should close socket when client tries to message spam", async function () {
    const topic = generateRandomBytes32();
    const { sub } = getTestJsonRpc(generateRandomBytes32(), topic);

    const providerA = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerA.connect();

    const providerB = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
    await providerB.connect();

    // N amount
    const amount = config.throttle.messages * 2;

    // acknowledging received payloads
    providerB.on("payload", (payload: JsonRpcPayload) => {
      const response = formatJsonRpcResult(payload.id, true);
      providerB.connection.send(response);
    });

    // generates N messages with index as content
    const sent = Array.from(Array(amount)).map((_, i) => String(i + 1));

    // send N messages to topic
    sent.map((i) => {
      providerA.request(getTestJsonRpc(i, topic).pub);
    });

    // subscribe to topic
    providerB.request(sub);

    const received: string[] = [];
    providerB.on("message", ({ type, data }) => {
      if (type === RELAY_JSONRPC.iridium.subscription && data.data.topic === topic) {
        const content = data.data.message;
        received.push(content);
      }
    });
    /**
     * the received messages must be less than the sent amount
     * when the socket is killed due to anti-spam
     */
    await Promise.all([
      await new Promise<void>((resolve) => {
        providerA.on("disconnect", (_message) => {
          expect(received.length).to.be.lte(amount);
          resolve();
        });
      }),

      await new Promise<void>((resolve) => {
        providerB.on("disconnect", (_message) => {
          expect(received.length).to.be.lte(amount);
          resolve();
        });
      }),
    ]);
  });

  it("A can publish to B using deprecated jsonrpc prefix method of waku_", async () => {
    const { topic, pub, sub } = getTestJsonRpc();
    pub.method = RELAY_JSONRPC.waku.publish;
    sub.method = RELAY_JSONRPC.waku.subscribe;

    const providerA = new JsonRpcProvider(
      new WsConnection(`${TEST_WS_URL}&auth=${await getJWT(TEST_RELAY_URL)}`),
    );
    await providerA.connect();
    const providerB = new JsonRpcProvider(
      new WsConnection(`${TEST_WS_URL}&auth=${await getJWT(TEST_RELAY_URL)}`),
    );
    await providerB.connect();

    let subscriptionB: string;

    const counterB = new Counter();

    await Promise.all([
      new Promise<void>(async (resolve) => {
        // subscribing to topics
        subscriptionB = await providerB.request(sub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // publishing to topics
        providerA.request(pub);
        resolve();
      }),
      new Promise<void>((resolve) => {
        // acknowledging received payloads
        providerB.on("payload", (payload: JsonRpcPayload) => {
          const response = formatJsonRpcResult(payload.id, true);
          providerB.connection.send(response);
          resolve();
        });
      }),
      new Promise<void>((resolve) => {
        // evaluating incoming subscriptions
        providerB.on("message", ({ type, data }) => {
          counterB.tick();
          expect(type).to.eql(RELAY_JSONRPC.waku.subscription);
          if (subscriptionB) expect(data.id).to.eql(subscriptionB);
          expect(data.data.topic).to.eql(pub.params.topic);
          expect(data.data.message).to.eql(pub.params.message);
          resolve();
        });
      }),
    ]);

    expect(counterB.value).to.eql(1);
  });
  describe("offline", () => {
    it("B can receive pending messages published while offline", async () => {
      const { pub, sub } = getTestJsonRpc();

      const providerA = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
      await providerA.connect();

      // publishing to topics
      await providerA.request(pub);

      const providerB = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
      await providerB.connect();

      let subscriptionB: string;

      const counterB = new Counter();

      await Promise.all([
        new Promise<void>(async (resolve) => {
          // subscribing to topics
          subscriptionB = await providerB.request(sub);
          resolve();
        }),
        new Promise<void>((resolve) => {
          // acknowledging received payloads
          providerB.on("payload", (payload: JsonRpcPayload) => {
            const response = formatJsonRpcResult(payload.id, true);
            providerB.connection.send(response);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          // evaluating incoming subscriptions
          providerB.on("message", ({ type, data }) => {
            counterB.tick();
            expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
            if (subscriptionB) expect(data.id).to.eql(subscriptionB);
            expect(data.data.topic).to.eql(pub.params.topic);
            expect(data.data.message).to.eql(pub.params.message);
            resolve();
          });
        }),
      ]);

      expect(counterB.value).to.eql(1);

      const providerC = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
      await providerC.connect();

      let subscriptionC: string;

      const counterC = new Counter();

      await Promise.all([
        new Promise<void>(async (resolve) => {
          // subscribing to topics
          subscriptionC = await providerC.request(sub);
          resolve();
        }),
        new Promise<void>((resolve) => {
          // acknowledging received payloads
          providerC.on("payload", (payload: JsonRpcPayload) => {
            const response = formatJsonRpcResult(payload.id, true);
            providerC.connection.send(response);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          // evaluating incoming subscriptions
          providerC.on("message", ({ type, data }) => {
            counterC.tick();
            expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
            if (subscriptionC) expect(data.id).to.eql(subscriptionC);
            expect(data.data.topic).to.eql(pub.params.topic);
            expect(data.data.message).to.eql(pub.params.message);
            resolve();
          });
        }),
      ]);

      expect(counterC.value).to.eql(1);
    });
    it("C can receive pending messages published on other providers while offline", async function () {
      this.timeout(5000);
      const { pub, sub } = getTestJsonRpc(generateRandomBytes32());
      const providerA = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
      await providerA.connect();
      await providerA.request(pub);
      const providerB = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
      await providerB.connect();
      let subscriptionB: string;
      const counterB = new Counter();
      await Promise.all([
        new Promise<void>(async (resolve) => {
          // subscribing to topics
          subscriptionB = await providerB.request(sub);
          resolve();
        }),
        new Promise<void>((resolve) => {
          // acknowledging received payloads
          providerB.on("payload", (payload: JsonRpcPayload) => {
            const response = formatJsonRpcResult(payload.id, true);
            providerB.connection.send(response);
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          // evaluating incoming subscriptions
          providerB.on("message", ({ type, data }) => {
            counterB.tick();
            expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
            if (subscriptionB) expect(data.id).to.eql(subscriptionB);
            expect(data.data.topic).to.eql(pub.params.topic);
            expect(data.data.message).to.eql(pub.params.message);
            resolve();
          });
        }),
      ]);

      expect(counterB.value).to.eql(1);

      return new Promise((resolve) => {
        setTimeout(async () => {
          const providerC = new JsonRpcProvider(new WsConnection(TEST_WS_URL));
          await providerC.connect();
          let subscriptionC: string;
          const counterC = new Counter();
          await Promise.all([
            new Promise<void>(async (resolve) => {
              subscriptionC = await providerC.request(sub);
              resolve();
            }),
            new Promise<void>((resolve) => {
              providerC.on("payload", (payload: JsonRpcPayload) => {
                const response = formatJsonRpcResult(payload.id, true);
                providerC.connection.send(response);
                resolve();
              });
            }),
            new Promise<void>((resolve) => {
              providerC.on("message", ({ type, data }) => {
                counterC.tick();
                expect(type).to.eql(RELAY_JSONRPC.iridium.subscription);
                if (subscriptionC) expect(data.id).to.eql(subscriptionC);
                expect(data.data.topic).to.eql(pub.params.topic);
                expect(data.data.message).to.eql(pub.params.message);
                resolve();
              });
            }),
          ]);
          expect(counterC.value).to.eql(1);
          resolve();
        }, 500);
      });
    });
  });
});
