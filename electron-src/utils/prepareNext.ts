//

import { app } from "electron";
import Logger from "electron-log";
import { createServer } from "http";
import fs from "node:fs";
import Module, { createRequire } from "node:module";
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
      `Exclude it when copying the web repo.`,
  );
}

const nextConfig = {
  dir: nextDir,
  dev: isDev,
};

export const getNextNodeModulesCandidates = (
  rendererDir: string,
  devMode: boolean,
): string[] => {
  const packagedCandidates = [
    path.join(rendererDir, "out", "node_modules"),
    path.join(rendererDir, "out", "dev", "node_modules"),
  ];
  const liveRendererCandidate = path.join(rendererDir, "node_modules");

  return devMode
    ? [liveRendererCandidate, ...packagedCandidates]
    : [...packagedCandidates, liveRendererCandidate];
};

function bootstrapNodePathSearch(): void {
  const candidateNodeModulesDirs = getNextNodeModulesCandidates(nextDir, isDev);

  const existingDirs = candidateNodeModulesDirs.filter((dir) =>
    fs.existsSync(dir),
  );

  if (existingDirs.length === 0) {
    Logger.info("NODE_PATH EXTRA:", "none");
    return;
  }

  const currentNodePath = (process.env.NODE_PATH ?? "")
    .split(path.delimiter)
    .filter((entry) => entry.length > 0);

  const mergedNodePath = [
    ...existingDirs.filter((dir) => !currentNodePath.includes(dir)),
    ...currentNodePath,
  ];
  process.env.NODE_PATH = mergedNodePath.join(path.delimiter);

  const normalizedNodePaths = Array.from(
    new Set(mergedNodePath.filter((entry) => entry.length > 0))
  );
  for (let i = normalizedNodePaths.length - 1; i >= 0; i -= 1) {
    const nodePathEntry = normalizedNodePaths[i];
    if (!Module.globalPaths.includes(nodePathEntry)) {
      Module.globalPaths.unshift(nodePathEntry);
    }
    if (!module.paths.includes(nodePathEntry)) {
      module.paths.unshift(nodePathEntry);
    }
  }

  const moduleWithInit = Module as unknown as {
    _initPaths?: (() => void) | undefined;
  };
  if (!Array.isArray(Module.globalPaths) || !Array.isArray(module.paths)) {
    moduleWithInit._initPaths?.();
  }

  Logger.info("NODE_PATH EXTRA:", existingDirs.join(path.delimiter));
}

type NextFactory = (config: { dir: string; dev: boolean }) => {
  prepare: () => Promise<void>;
  getRequestHandler: () => (
    req: unknown,
    res: unknown,
    parsedUrl?: unknown,
  ) => void;
};

function resolveNextFactory(): NextFactory {
  const candidatePackageJsons = getNextNodeModulesCandidates(nextDir, isDev).map(
    (candidateNodeModulesDir) =>
      path.join(candidateNodeModulesDir, "next", "package.json"),
  );

  for (const candidatePackageJson of candidatePackageJsons) {
    if (!fs.existsSync(candidatePackageJson)) {
      continue;
    }
    try {
      const requireFromCandidate = createRequire(candidatePackageJson);
      const loaded = requireFromCandidate("next") as
        | NextFactory
        | { default?: NextFactory };
      const nextFactory =
        typeof loaded === "function" ? loaded : loaded.default;
      if (typeof nextFactory === "function") {
        Logger.info("NEXT MODULE:", candidatePackageJson);
        return nextFactory;
      }
    } catch (error) {
      Logger.warn("NEXT MODULE LOAD FAILED:", candidatePackageJson, error);
    }
  }

  const appRequire = createRequire(path.join(app.getAppPath(), "package.json"));
  const loaded = appRequire("next") as NextFactory | { default?: NextFactory };
  const nextFactory = typeof loaded === "function" ? loaded : loaded.default;
  if (typeof nextFactory !== "function") {
    throw new Error("Failed to resolve Next.js module");
  }
  Logger.info("NEXT MODULE:", "app-level fallback");
  return nextFactory;
}

bootstrapNodePathSearch();
const next = resolveNextFactory();
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
