import type { IncomingMessage, ServerResponse } from "node:http";
import type { BrowserWalletClaim } from "./browser-wallet-requests";

/**
 * The app server endpoint the browser connector page uses to read the
 * request 6529 Desktop Classic issued, by its one-time id. Only the page itself can
 * call it: same-origin POST (Sec-Fetch-Site required; the supported browsers
 * send it) with a custom header, the app's own Host, no CORS headers. It
 * never lists requests; it answers only for a known id.
 */
export const BROWSER_WALLET_REQUEST_PATH = "/_desktop/browser-wallet-request";
export const BROWSER_WALLET_REQUEST_HEADER = "x-6529-browser-connector";

const MAX_BODY_BYTES = 1024;

export interface BrowserWalletEndpointDeps {
  readonly claim: (id: unknown) => BrowserWalletClaim;
}

function send(
  res: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  res.end(JSON.stringify(body));
}

const header = (req: IncomingMessage, name: string): string | undefined => {
  const value = req.headers[name];
  return Array.isArray(value) ? undefined : value;
};

/** The app's own origins on the port this server is bound to. */
function allowedHosts(req: IncomingMessage): string[] {
  const port = req.socket.localPort;
  return port ? [`localhost:${port}`, `127.0.0.1:${port}`] : [];
}

/** Whether the request comes from a page served by this server. */
export function isSameOriginPageRequest(req: IncomingMessage): boolean {
  const hosts = allowedHosts(req);
  const host = header(req, "host")?.toLowerCase();
  const origin = header(req, "origin")?.toLowerCase();
  const fetchSite = header(req, "sec-fetch-site");
  const contentType = header(req, "content-type")?.toLowerCase() ?? "";
  return (
    !!host &&
    hosts.includes(host) &&
    !!origin &&
    hosts.some((allowed) => origin === `http://${allowed}`) &&
    origin === `http://${host}` &&
    fetchSite === "same-origin" &&
    header(req, BROWSER_WALLET_REQUEST_HEADER) === "1" &&
    contentType.split(";")[0].trim() === "application/json"
  );
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        finish(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => finish(null));
  });
}

/**
 * Handles the browser wallet request endpoint; returns false for every other
 * path so the request goes on to the renderer.
 */
export function handleBrowserWalletEndpoint(
  req: IncomingMessage,
  res: ServerResponse,
  deps: BrowserWalletEndpointDeps,
): boolean {
  const path = (req.url ?? "").split("?")[0];
  if (path !== BROWSER_WALLET_REQUEST_PATH) return false;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    send(res, 405, { error: "method-not-allowed" });
    return true;
  }
  if (!isSameOriginPageRequest(req)) {
    send(res, 403, { error: "forbidden" });
    return true;
  }
  void readBody(req).then((body) => {
    let id: unknown;
    try {
      id = body === null ? undefined : (JSON.parse(body) as { id?: unknown })?.id;
    } catch {
      id = undefined;
    }
    const claim = deps.claim(id);
    if (!claim.ok) {
      send(res, 404, { error: claim.code });
      return;
    }
    send(res, 200, {
      request: claim.request,
      returnToken: claim.returnToken,
      expiresInMs: claim.expiresInMs,
    });
  });
  return true;
}
