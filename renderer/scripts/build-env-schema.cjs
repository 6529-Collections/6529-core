#!/usr/bin/env node
const esbuild = require("esbuild");

esbuild
  .build({
    entryPoints: ["renderer/config/env.schema.ts"],
    outfile: "renderer/config/env.schema.runtime.cjs",
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
