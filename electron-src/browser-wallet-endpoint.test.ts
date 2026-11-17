import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import {
  BROWSER_WALLET_REQUEST_HEADER,
  BROWSER_WALLET_REQUEST_PATH,
  handleBrowserWalletEndpoint,
} from "./browser-wallet-endpoint";
import { BrowserWalletRequestStore } from "./browser-wallet-requests";

const address = `0x${"11".repeat(20)}`;
const store = new BrowserWalletRequestStore({ hasSession: () => true });
let server: http.Server;
let port = 0;
let id = "";

function post(
  headers: Record<string, string>,
  body: string,
  path = BROWSER_WALLET_REQUEST_PATH,
  method = "POST",
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method, headers, setHost: false },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

const pageHeaders = () => ({
  Host: `localhost:${port}`,
  Origin: `http://localhost:${port}`,
  "Sec-Fetch-Site": "same-origin",
  "Content-Type": "application/json",
  [BROWSER_WALLET_REQUEST_HEADER]: "1",
});

describe("browser wallet request endpoint", () => {
  before(async () => {
    server = http.createServer((req, res) => {
      if (handleBrowserWalletEndpoint(req, res, { claim: (value) => store.claim(value) })) return;
      res.writeHead(200).end("renderer");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    const created = store.create({
      method: "personal_sign",
      params: ["0x6869", address],
      address,
      chainId: 1,
    });
    assert.ok(created.ok);
    if (created.ok) id = created.id;
  });

  after(() => {
    store.cancelAll();
    server.close();
  });

  it("returns the issued request to its own page", async () => {
    const response = await post(pageHeaders(), JSON.stringify({ id }));
    assert.equal(response.status, 200);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(response.headers["cache-control"], "no-store");
    const body = JSON.parse(response.body);
    assert.deepEqual(body.request, {
      method: "personal_sign",
      address,
      chainId: 1,
      message: "0x6869",
    });
    assert.match(body.returnToken, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(body.expiresInMs > 0 && body.expiresInMs <= 120_000);
  });

  it("refuses a request id the app did not issue", async () => {
    const response = await post(pageHeaders(), JSON.stringify({ id: "A".repeat(43) }));
    assert.equal(response.status, 404);
    assert.deepEqual(JSON.parse(response.body), { error: "unknown" });
  });

  it("refuses callers that are not the app's own page", async () => {
    const cases: Array<Record<string, string | undefined>> = [
      { Origin: "http://127.0.0.1:1" },
      { Origin: "https://example.com" },
      { Origin: undefined },
      { "Sec-Fetch-Site": "cross-site" },
      { "Sec-Fetch-Site": "same-site" },
      { "Sec-Fetch-Site": undefined },
      { [BROWSER_WALLET_REQUEST_HEADER]: undefined },
      { "Content-Type": "text/plain" },
      { Host: `example.com:${port}`, Origin: `http://example.com:${port}` },
    ];
    for (const overrides of cases) {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries({ ...pageHeaders(), ...overrides })) {
        if (value !== undefined) headers[key] = value;
      }
      const response = await post(headers, JSON.stringify({ id }));
      assert.equal(response.status, 403, JSON.stringify(overrides));
      assert.doesNotMatch(response.body, /returnToken|personal_sign/);
    }
  });

  it("allows only POST and never answers preflight requests", async () => {
    for (const method of ["GET", "OPTIONS"]) {
      const response = await post(pageHeaders(), "", BROWSER_WALLET_REQUEST_PATH, method);
      assert.equal(response.status, 405);
      assert.equal(response.headers["access-control-allow-origin"], undefined);
    }
  });

  it("leaves every other path to the renderer", async () => {
    const response = await post(pageHeaders(), "", "/browser-connector", "GET");
    assert.equal(response.body, "renderer");
  });
});
