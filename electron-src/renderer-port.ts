// Browser device keys and encrypted history belong to localhost:<port>.
// Prefer the first successful origin on subsequent launches without ever
// adopting another application's listener or replacing a busy saved origin.
export const RENDERER_PORT_STORE_KEY = "renderer_port";
export const DEFAULT_RENDERER_PORT = 6529;

export function parseRememberedRendererPort(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1024 &&
    value <= 65535
    ? value
    : null;
}

export async function resolveRendererPort({
  remembered,
  listen,
  remember,
}: {
  readonly remembered: unknown;
  readonly listen: (preferredPort: number) => Promise<number>;
  readonly remember: (port: number) => void;
}): Promise<number> {
  const preferred = parseRememberedRendererPort(remembered);
  // prepareNext returns only after our own server has bound successfully,
  // including collision retries. Never persist a merely probed port.
  const port = await listen(preferred ?? DEFAULT_RENDERER_PORT);
  if (preferred === null) remember(port);
  return port;
}
