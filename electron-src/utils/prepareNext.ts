//

import Logger from "electron-log";
import path from "node:path";
import next from "next";
import { createServer } from "http";
import { parse } from "url";
import { isDev } from "./env";
import { app } from "electron";

if (!isDev) {
  // @ts-ignore
  process.env.NODE_ENV = "production";
}

const nextDir = path.join(app.getAppPath(), "renderer");
Logger.info("NEXT DIR:", nextDir);

const nextConfig = {
  dir: nextDir,
  dev: isDev,
};

const nextApp = next(nextConfig);
const handle = nextApp.getRequestHandler();

export async function prepareNext(port: number) {
  await nextApp.prepare();

  const nextServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  nextServer.listen(port, () => {
    Logger.info("NEXT SERVER:", `Ready on http://localhost:${port}`);
  });
}
