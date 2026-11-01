// The window loads the renderer from http://localhost:<port>, and that origin
// owns the renderer's browser storage: IndexedDB and localStorage hold the
// encrypted-messages device keys, the signed-messages device key and the web
// session. Another port is another origin with empty storage, so a changed
// port silently loses that device (and re-enrolling uses another of the
// profile's device slots). Keep the renderer on the port it used before.

export const RENDERER_PORT_STORE_KEY = "renderer_port";
export const DEFAULT_RENDERER_PORT = 6529;
const RENDERER_PORT_RANGE: [number, number] = [3000, 8000];
// The renderer server listens on loopback only (utils/prepareNext). Check the
// same address: on Windows a wildcard probe succeeds while another program
// holds 127.0.0.1 on that port.
const RENDERER_HOST = "127.0.0.1";
const MIN_RENDERER_PORT = 1024;
const MAX_RENDERER_PORT = 65535;

export interface RendererPortSearch {
  readonly host: string;
  readonly random: true;
  readonly port: number;
  readonly ports: number[];
  readonly portRange: [number, number];
}

/** The remembered renderer port, or null when none (or an invalid one) is stored. */
export function parseRememberedRendererPort(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_RENDERER_PORT &&
    value <= MAX_RENDERER_PORT
    ? value
    : null;
}

/**
 * The port search: the remembered port first, then 6529, then the first free
 * port of the existing range, then a random one.
 */
export function getRendererPortSearch(remembered: unknown): RendererPortSearch {
  const preferred =
    parseRememberedRendererPort(remembered) ?? DEFAULT_RENDERER_PORT;
  return {
    host: RENDERER_HOST,
    random: true,
    port: preferred,
    ports: preferred === DEFAULT_RENDERER_PORT ? [] : [DEFAULT_RENDERER_PORT],
    portRange: [...RENDERER_PORT_RANGE],
  };
}

/**
 * Picks the renderer port and remembers it when no port was remembered yet.
 * A remembered port that is busy for one launch stays remembered, so the next
 * launch returns to the origin that holds this device's keys.
 */
export async function resolveRendererPort({
  remembered,
  findPort,
  remember,
}: {
  readonly remembered: unknown;
  readonly findPort: (search: RendererPortSearch) => Promise<number>;
  readonly remember: (port: number) => void;
}): Promise<number> {
  const port = await findPort(getRendererPortSearch(remembered));
  if (parseRememberedRendererPort(remembered) === null) {
    remember(port);
  }
  return port;
}
