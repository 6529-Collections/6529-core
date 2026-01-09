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
const rendererConfigBak = path.join(nextDir, "next.config.ts.electronbak");
const rendererConfigCompiled = path.join(nextDir, "next.config.compiled.js");

if (fs.existsSync(rendererConfigCompiled)) {
  fs.unlinkSync(rendererConfigCompiled);
}
if (fs.existsSync(rendererConfigTs)) {
  fs.renameSync(rendererConfigTs, rendererConfigBak);
}

const nextConfig = {
  dir: nextDir,
  dev: isDev,
};

const nextApp = next(nextConfig);
const handle = nextApp.getRequestHandler();

export async function prepareNext(port: number) {
  try {
    await nextApp.prepare();
  } finally {
    if (fs.existsSync(rendererConfigBak)) {
      fs.renameSync(rendererConfigBak, rendererConfigTs);
    }
  }

  const nextServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  nextServer.listen(port, () => {
    Logger.info("NEXT SERVER:", `Ready on http://localhost:${port}`);
  });
}
