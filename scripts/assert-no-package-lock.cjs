#!/usr/bin/env node

const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const packageLockPath = resolve(__dirname, "..", "package-lock.json");

if (existsSync(packageLockPath)) {
  console.error("package-lock.json must not exist in this repository.");
  console.error("This repo now uses pnpm with pnpm-lock.yaml.");
  process.exit(1);
}
