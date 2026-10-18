#!/usr/bin/env node

// Bundles the compiled main process (desktop slimming plan S2.1).
//
// tsc compiles electron-src into main/ (keeping TypeORM's decorator
// metadata, which esbuild cannot emit); this script then bundles each entry
// point with its dependencies into one file at the same path, so the
// packaged app loads a handful of files instead of resolving hundreds of
// modules through node_modules at every start. Only packages that ship
// native code or helper files next to their JavaScript stay external and
// remain runtime dependencies.

const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const MAIN = path.join(ROOT, "main");
const STAGING = path.join(ROOT, "main-bundle");

// Entry points, relative to main/. Each keeps its path, so code that finds
// another entry relative to the app's code directory keeps working.
const ENTRIES = [
  "electron-src/index.js",
  "electron-src/preload.js",
  "electron-src/preload-splash.js",
  "electron-src/scheduled-tasks/workers/transactions-worker/index.js",
  "electron-src/scheduled-tasks/workers/nftdelegation-worker/index.js",
  "electron-src/scheduled-tasks/workers/nft-worker/nft-discovery.js",
  "electron-src/scheduled-tasks/workers/tdh-worker/index.js",
];

// Loaded from node_modules at run time: native modules, packages that read
// helper files beside their own code, and Electron itself.
const RUNTIME_EXTERNALS = [
  "electron",
  "electron/*",
  "better-sqlite3",
  "minidump",
  "open",
];

// TypeORM requires every database driver it supports by name; this app uses
// better-sqlite3 only, so the others are never loaded. Checked against
// TypeORM 0.3.31: a driver a later version adds and this list misses makes
// esbuild fail the build ("Could not resolve"), not the app at run time.
const UNUSED_TYPEORM_DRIVERS = [
  "@google-cloud/spanner",
  "@sap/hana-client",
  "@sap/hana-client/extension/Stream",
  "hdb-pool",
  "ioredis",
  "mongodb",
  "mssql",
  "mysql",
  "mysql2",
  "oracledb",
  "pg",
  "pg-native",
  "pg-query-stream",
  "react-native-sqlite-storage",
  "redis",
  "sql.js",
  "sqlite3",
  "typeorm-aurora-data-api-driver",
  "@capacitor-community/sqlite",
  "expo-sqlite",
];

async function main() {
  for (const entry of ENTRIES) {
    if (!fs.existsSync(path.join(MAIN, entry))) {
      throw new Error(`[bundle-main] missing compiled entry main/${entry}; run tsc first`);
    }
  }
  fs.rmSync(STAGING, { recursive: true, force: true });
  const result = await esbuild.build({
    absWorkingDir: MAIN,
    entryPoints: ENTRIES,
    outdir: STAGING,
    outbase: MAIN,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: [...RUNTIME_EXTERNALS, ...UNUSED_TYPEORM_DRIVERS],
    // Keep names readable in stack traces and logs.
    keepNames: true,
    sourcemap: false,
    metafile: true,
    logLevel: "warning",
  });

  // Replace the compiled tree with the bundles, keeping copied assets.
  const assets = path.join(MAIN, "electron-src", "assets");
  const keep = path.join(STAGING, "electron-src", "assets");
  if (fs.existsSync(assets)) {
    fs.cpSync(assets, keep, { recursive: true });
  }
  const config = path.join(MAIN, "config");
  if (fs.existsSync(config)) {
    fs.cpSync(config, path.join(STAGING, "config"), { recursive: true });
  }
  // Swap folders so an interrupted build never leaves main/ missing.
  const previous = `${MAIN}-previous`;
  fs.rmSync(previous, { recursive: true, force: true });
  fs.renameSync(MAIN, previous);
  fs.renameSync(STAGING, MAIN);
  fs.rmSync(previous, { recursive: true, force: true });

  const outputs = Object.entries(result.metafile.outputs).map(([file, info]) => ({
    // Metafile paths are relative to absWorkingDir (main/).
    file: path.relative(STAGING, path.resolve(MAIN, file)),
    bytes: info.bytes,
  }));
  for (const { file, bytes } of outputs) {
    console.log(`[bundle-main] ${file.split(path.sep).join("/")} ${(bytes / 1e6).toFixed(2)} MB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
