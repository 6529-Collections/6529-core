#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_JSON = path.join(
  ROOT,
  "electron-src",
  "config",
  "public-runtime.json"
);
const DEST_JSON = path.join(
  ROOT,
  "main",
  "electron-src",
  "__PUBLIC_RUNTIME.json"
);

function computeVersion() {
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "6529core";
  }
}

(function main() {
  if (!fs.existsSync(SRC_JSON)) {
    throw new Error(`Missing ${SRC_JSON}. Create it with your values.`);
  }
  const raw = JSON.parse(fs.readFileSync(SRC_JSON, "utf8"));

  const VERSION = process.env.VERSION || computeVersion();
  const ASSETS_FROM_S3 = (process.env.ASSETS_FROM_S3 ?? "false").toLowerCase();

  const baked = { ...raw, VERSION, ASSETS_FROM_S3 };

  fs.mkdirSync(path.dirname(DEST_JSON), { recursive: true });
  fs.writeFileSync(DEST_JSON, JSON.stringify(baked, null, 2), "utf8");

  console.log(`[bake-public-runtime] wrote ${path.relative(ROOT, DEST_JSON)}`);
})();
