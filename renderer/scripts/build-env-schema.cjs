#!/usr/bin/env node
const esbuild = require("esbuild");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

esbuild
  .build({
    entryPoints: [path.join(repoRoot, "config/env.schema.ts")],
    outfile: path.join(repoRoot, "config/env.schema.runtime.cjs"),
    platform: "node",
    format: "cjs",
    bundle: true,
    sourcemap: false,
    logLevel: "info",
  })
  .catch((e) => {
    console.error("[build-env-schema] Failed:", e);
    process.exit(1);
  });
