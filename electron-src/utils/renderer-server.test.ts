import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test, type TestContext } from "node:test";
import { getPort } from "get-port-please";
import { listenRendererServer } from "./renderer-server";

function createTestServer(t: TestContext, content: string) {
  const server = createServer((_request, response) => response.end(content));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return server;
}

async function occupyPort(server: Server, port = 0) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  return (server.address() as AddressInfo).port;
}

async function readUi(port: number) {
  const response = await fetch(`http://127.0.0.1:${port}`, {
    headers: { Connection: "close" },
  });
  return response.text();
}

test("an IPv4 loopback listener forces Desktop onto a different port", async (t) => {
  const validator = createTestServer(t, "Validator");
  const occupiedPort = await occupyPort(validator);
  const desktop = createTestServer(t, "Desktop");

  const port = await listenRendererServer(desktop, occupiedPort);

  assert.notEqual(port, occupiedPort);
  assert.equal((desktop.address() as AddressInfo).address, "127.0.0.1");
  assert.equal(await readUi(port), "Desktop");
  assert.equal(await readUi(occupiedPort), "Validator");
});

test("a collision after port selection retries and waits for Desktop to listen", async (t) => {
  const competitor = createTestServer(t, "Other app");
  const desktop = createTestServer(t, "Desktop");
  const preferredPort = await getPort({ host: "127.0.0.1", port: 0 });
  let selections = 0;

  const port = await listenRendererServer(
    desktop,
    preferredPort,
    async (options) => {
      const candidate = await getPort(options);
      if (++selections === 1) await occupyPort(competitor, candidate);
      return candidate;
    },
  );

  assert.equal(selections, 2);
  assert.notEqual(port, (competitor.address() as AddressInfo).port);
  assert.equal(desktop.listening, true);
  assert.equal(await readUi(port), "Desktop");
});

test("persistent bind collisions fail after a bounded number of retries", async (t) => {
  const blocker = createTestServer(t, "Other app");
  const occupiedPort = await occupyPort(blocker);
  const desktop = createTestServer(t, "Desktop");
  let attempts = 0;
  const listeningListeners = desktop.listenerCount("listening");

  await assert.rejects(
    listenRendererServer(desktop, occupiedPort, async () => {
      attempts++;
      return occupiedPort;
    }),
    { code: "EADDRINUSE" },
  );

  assert.equal(attempts, 5);
  assert.equal(desktop.listening, false);
  assert.equal(desktop.listenerCount("error"), 0);
  assert.equal(desktop.listenerCount("listening"), listeningListeners);
});

test("other listener failures propagate without retrying", async (t) => {
  const desktop = createTestServer(t, "Desktop");
  let attempts = 0;
  const listeningListeners = desktop.listenerCount("listening");
  t.mock.method(desktop, "listen", () => {
    attempts++;
    queueMicrotask(() =>
      desktop.emit(
        "error",
        Object.assign(new Error("Denied"), { code: "EACCES" }),
      ),
    );
    return desktop;
  });

  await assert.rejects(listenRendererServer(desktop, 6529), { code: "EACCES" });
  assert.equal(attempts, 1);
  assert.equal(desktop.listening, false);
  assert.equal(desktop.listenerCount("listening"), listeningListeners);
});
