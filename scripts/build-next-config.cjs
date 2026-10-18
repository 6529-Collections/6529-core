#!/usr/bin/env node

// Compiles the root next.config.ts into a self-contained next.config.mjs.
// Bundling its imports (next/constants, dotenv) means the packaged app does
// not need a root copy of Next just to load its configuration; the renderer
// server loads Next from renderer/out/node_modules.
//
// Next imports the config with native ESM import(), where `require` does not
// exist, but bundled CommonJS dependencies still call it; the banner defines
// it. The config's own runtime require() calls (the generated env schema,
// package.json) stay runtime reads.

const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");

esbuild.buildSync({
  absWorkingDir: ROOT,
  entryPoints: ["next.config.ts"],
  outfile: "next.config.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  logLevel: "warning",
  banner: {
    js: "import { createRequire as __bundleCreateRequire } from 'node:module'; const require = __bundleCreateRequire(import.meta.url);",
  },
});
