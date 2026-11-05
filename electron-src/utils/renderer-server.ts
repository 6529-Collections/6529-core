import type { Server } from "node:http";
import { getPort } from "get-port-please";

const RENDERER_HOST = "127.0.0.1";
const MAX_BIND_ATTEMPTS = 5;

/** Keep the localhost origin while Chromium connects to our IPv4 listener. */
export function configureRendererHostResolution(commandLine: {
  appendSwitch(name: string, value: string): void;
}): void {
  commandLine.appendSwitch(
    "host-resolver-rules",
    `MAP localhost ${RENDERER_HOST}`,
  );
}

export async function listenRendererServer(
  server: Server,
  preferredPort: number,
  selectPort = getPort,
): Promise<number> {
  for (let attempt = 1; attempt <= MAX_BIND_ATTEMPTS; attempt++) {
    const port = await selectPort({
      host: RENDERER_HOST,
      port: preferredPort,
      portRange: [3000, 8000],
      random: true,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.removeListener("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.removeListener("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, RENDERER_HOST);
      });
      return port;
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "EADDRINUSE" ||
        attempt === MAX_BIND_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
  throw new Error("Unable to bind the Desktop renderer server");
}
