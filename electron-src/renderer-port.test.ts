import assert from "node:assert/strict";
import { createServer, type Server } from "node:net";
import { describe, it } from "node:test";
import { getPort } from "get-port-please";
import {
  DEFAULT_RENDERER_PORT,
  getRendererPortSearch,
  parseRememberedRendererPort,
  resolveRendererPort,
  type RendererPortSearch,
} from "./renderer-port";

function listen(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("renderer port", () => {
  it("accepts only a remembered integer port outside the privileged range", () => {
    assert.equal(parseRememberedRendererPort(4321), 4321);
    assert.equal(parseRememberedRendererPort(65535), 65535);
    assert.equal(parseRememberedRendererPort(undefined), null);
    assert.equal(parseRememberedRendererPort("4321"), null);
    assert.equal(parseRememberedRendererPort(80), null);
    assert.equal(parseRememberedRendererPort(70000), null);
    assert.equal(parseRememberedRendererPort(4321.5), null);
  });

  it("tries the remembered port first, then 6529, then the range", () => {
    assert.deepEqual(getRendererPortSearch(4321), {
      host: "127.0.0.1",
      random: true,
      port: 4321,
      ports: [DEFAULT_RENDERER_PORT],
      portRange: [3000, 8000],
    });
    assert.deepEqual(getRendererPortSearch(undefined), {
      host: "127.0.0.1",
      random: true,
      port: DEFAULT_RENDERER_PORT,
      ports: [],
      portRange: [3000, 8000],
    });
    assert.deepEqual(getRendererPortSearch(DEFAULT_RENDERER_PORT).ports, []);
  });

  it("remembers the first port it picks", async () => {
    const remembered: number[] = [];
    const port = await resolveRendererPort({
      remembered: undefined,
      findPort: async (search) => search.port,
      remember: (value) => remembered.push(value),
    });
    assert.equal(port, DEFAULT_RENDERER_PORT);
    assert.deepEqual(remembered, [DEFAULT_RENDERER_PORT]);
  });

  it("keeps the remembered port when it is free", async () => {
    const searches: RendererPortSearch[] = [];
    const remembered: number[] = [];
    const port = await resolveRendererPort({
      remembered: 4321,
      findPort: async (search) => {
        searches.push(search);
        return search.port;
      },
      remember: (value) => remembered.push(value),
    });
    assert.equal(port, 4321);
    assert.equal(searches.length, 1);
    assert.deepEqual(remembered, []);
  });

  it("keeps remembering a busy port so the next launch returns to its origin", async () => {
    const remembered: number[] = [];
    const port = await resolveRendererPort({
      remembered: 4321,
      findPort: async () => 3000,
      remember: (value) => remembered.push(value),
    });
    assert.equal(port, 3000);
    assert.deepEqual(remembered, []);
  });

  it("reuses a remembered port with get-port-please, falling back while it is busy", async () => {
    const free = await getPort({ random: true, host: "127.0.0.1" });
    const remembered = free;
    const first = await resolveRendererPort({
      remembered,
      findPort: (search) => getPort(search),
      remember: () => assert.fail("a valid remembered port is not replaced"),
    });
    assert.equal(first, remembered);

    const blocker = await listen(remembered);
    try {
      const fallback = await resolveRendererPort({
        remembered,
        findPort: (search) => getPort(search),
        remember: () => assert.fail("a busy remembered port is not replaced"),
      });
      assert.notEqual(fallback, remembered);
    } finally {
      await close(blocker);
    }

    const again = await resolveRendererPort({
      remembered,
      findPort: (search) => getPort(search),
      remember: () => assert.fail("a valid remembered port is not replaced"),
    });
    assert.equal(again, remembered);
  });
});
