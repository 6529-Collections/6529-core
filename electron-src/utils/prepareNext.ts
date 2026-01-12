//

import { app } from "electron";
import Logger from "electron-log";
import { createServer } from "http";
import next from "next";
import fs from "node:fs";
import path from "node:path";
import { parse } from "url";
import { isDev } from "./env";

if (!isDev) {
  // @ts-ignore
  process.env.NODE_ENV = "production";
}

const nextDir = path.join(app.getAppPath(), "renderer");
Logger.info("NEXT DIR:", nextDir);

const rendererConfigTs = path.join(nextDir, "next.config.ts");
if (fs.existsSync(rendererConfigTs)) {
  throw new Error(
    `renderer/next.config.ts should not exist in the Electron repo. ` +
      `Exclude it when copying the web repo.`
  );
}

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
