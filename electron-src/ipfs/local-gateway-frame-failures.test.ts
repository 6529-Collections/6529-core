import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { observeLocalGatewayFrameFailures } from "./local-gateway-frame-failures";

test("reports gateway HTTP and transport failures only for direct app iframes", () => {
  const appOrigin = "http://localhost:6529";
  const gatewayOrigin = "http://127.0.0.1:8080";
  const artwork = `${gatewayOrigin}/ipfs/artwork/index.html`;
  const sent: [string, string][] = [];
  const events = new EventEmitter();
  let currentUrl = `${appOrigin}/waves`;
  const contents = Object.assign(events, {
    getURL: () => currentUrl,
    mainFrame: { frames: [{ processId: 7, routingId: 2 }] },
    send: (channel: string, url: string) => sent.push([channel, url]),
  }) as unknown as Parameters<typeof observeLocalGatewayFrameFailures>[0];
  observeLocalGatewayFrameFailures(contents, appOrigin, gatewayOrigin);

  events.emit("did-frame-navigate", {}, artwork, 200, "OK", false, 7, 2);
  events.emit("did-frame-navigate", {}, artwork, 504, "Timeout", true, 7, 2);
  events.emit("did-frame-navigate", {}, artwork, 504, "Timeout", false, 7, 3);
  events.emit("did-frame-navigate", {}, `${gatewayOrigin}/webui`, 504, "Timeout", false, 7, 2);
  events.emit("did-frame-navigate", {}, "http://127.0.0.1:8081/ipfs/artwork", 504, "Timeout", false, 7, 2);
  events.emit("did-fail-load", {}, -3, "ERR_ABORTED", artwork, false, 7, 2);
  currentUrl = "https://6529.io/waves";
  events.emit("did-frame-navigate", {}, artwork, 504, "Timeout", false, 7, 2);
  assert.deepEqual(sent, []);

  currentUrl = `${appOrigin}/waves`;
  events.emit("did-frame-navigate", {}, artwork, 504, "Timeout", false, 7, 2);
  events.emit("did-fail-load", {}, -324, "ERR_EMPTY_RESPONSE", artwork, false, 7, 2);
  assert.deepEqual(sent, [
    ["local-ipfs-frame-failed", artwork],
    ["local-ipfs-frame-failed", artwork],
  ]);
});
