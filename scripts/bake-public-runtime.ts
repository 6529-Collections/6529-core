#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_JSON = path.join(ROOT, "config", "public-runtime.json");
const DEST_JSON = path.join(ROOT, "main", "config", "__PUBLIC_RUNTIME.json");
const LIVE_API_ENDPOINT = "https://api.6529.io";
const LIVE_WS_ENDPOINT = "wss://ws.6529.io";
const TEST_API_ENDPOINT = "https://api.staging.6529.io";
const TEST_WS_ENDPOINT = "wss://ws.staging.6529.io";

type BackendTarget = "live" | "test";

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
  const NEXT_LOCAL_DEBUG =
    (process.env.NEXT_LOCAL_DEBUG ?? "false").toLowerCase() === "true";
  const backendTarget = getBackendTarget(raw.BACKEND_TARGET);

  if (
    process.env.APP_ENVIRONMENT === "production" &&
    backendTarget === "test"
  ) {
    throw new Error(
      "Production app environment cannot be built against Test backend.",
    );
  }

  const runtimeEndpointOverrides = getRuntimeEndpointOverrides(backendTarget);

  const baked = {
    ...raw,
    ...runtimeEndpointOverrides,
    VERSION,
    ASSETS_FROM_S3,
    DROP_FORGE_TESTNET: NEXT_LOCAL_DEBUG
      ? true
      : raw.DROP_FORGE_TESTNET ?? false,
  };

  fs.mkdirSync(path.dirname(DEST_JSON), { recursive: true });
  fs.writeFileSync(DEST_JSON, JSON.stringify(baked, null, 2), "utf8");

  console.log(`[bake-public-runtime] wrote ${path.relative(ROOT, DEST_JSON)}`);
})();

function getBackendTarget(fallbackTarget: unknown): BackendTarget {
  const rawTarget = process.env.BACKEND_TARGET ?? fallbackTarget ?? "live";
  if (rawTarget === "live" || rawTarget === "test") {
    return rawTarget;
  }
  throw new Error("BACKEND_TARGET must be live or test");
}

function getRuntimeEndpointOverrides(backendTarget: BackendTarget) {
  if (backendTarget === "test") {
    const stagingApiKey = process.env.STAGING_API_KEY?.trim();
    if (!stagingApiKey) {
      throw new Error(
        "Test backend target requires STAGING_API_KEY. Add it to .env.local or export it before building.",
      );
    }
    return {
      API_ENDPOINT: TEST_API_ENDPOINT,
      WS_ENDPOINT: TEST_WS_ENDPOINT,
      BACKEND_TARGET: "test",
      STAGING_API_KEY: stagingApiKey,
    };
  }

  return {
    API_ENDPOINT: LIVE_API_ENDPOINT,
    WS_ENDPOINT: LIVE_WS_ENDPOINT,
    BACKEND_TARGET: "live",
    STAGING_API_KEY: undefined,
  };
}
