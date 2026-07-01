#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_JSON = path.join(ROOT, "config", "public-runtime.json");
const DEST_JSON = path.join(ROOT, "main", "config", "__PUBLIC_RUNTIME.json");
const PRIVATE_DEST_JSON = path.join(
  ROOT,
  "main",
  "config",
  "__PRIVATE_RUNTIME.json",
);
const LIVE_API_ENDPOINT = "https://api.6529.io";
const LIVE_WS_ENDPOINT = "wss://ws.6529.io";
const TEST_API_ENDPOINT = "https://api.staging.6529.io";
const TEST_WS_ENDPOINT = "wss://ws.staging.6529.io";
const CORE_SCHEMES = {
  local: "localcore6529",
  staging: "stagingcore6529",
  production: "core6529",
} as const;
const CORE_SCHEME_VALUES = Object.values(CORE_SCHEMES);

type BackendTarget = "live" | "test";
type AppEnvironment = keyof typeof CORE_SCHEMES;

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
  const coreScheme = getCoreScheme({
    appEnvironment: process.env.APP_ENVIRONMENT ?? raw.APP_ENVIRONMENT,
    fallbackScheme: process.env.CORE_SCHEME ?? raw.CORE_SCHEME,
  });

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
    ...runtimeEndpointOverrides.publicRuntime,
    VERSION,
    ASSETS_FROM_S3,
    CORE_SCHEME: coreScheme,
    DROP_FORGE_TESTNET: NEXT_LOCAL_DEBUG
      ? true
      : raw.DROP_FORGE_TESTNET ?? false,
  };
  delete baked.STAGING_API_KEY;

  fs.mkdirSync(path.dirname(DEST_JSON), { recursive: true });
  fs.writeFileSync(DEST_JSON, JSON.stringify(baked, null, 2), "utf8");
  fs.writeFileSync(
    PRIVATE_DEST_JSON,
    JSON.stringify(runtimeEndpointOverrides.privateRuntime, null, 2),
    "utf8",
  );

  console.log(`[bake-public-runtime] wrote ${path.relative(ROOT, DEST_JSON)}`);
  console.log(
    `[bake-public-runtime] wrote ${path.relative(ROOT, PRIVATE_DEST_JSON)}`,
  );
})();

function getBackendTarget(fallbackTarget: unknown): BackendTarget {
  const rawTarget = process.env.BACKEND_TARGET ?? fallbackTarget ?? "live";
  if (rawTarget === "live" || rawTarget === "test") {
    return rawTarget;
  }
  throw new Error("BACKEND_TARGET must be live or test");
}

function isAppEnvironment(value: unknown): value is AppEnvironment {
  return (
    value === "local" || value === "staging" || value === "production"
  );
}

function normalizeCoreScheme(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/:\/\/$/, "");
  return CORE_SCHEME_VALUES.includes(
    normalized as (typeof CORE_SCHEME_VALUES)[number]
  )
    ? normalized
    : null;
}

function getCoreScheme({
  appEnvironment,
  fallbackScheme,
}: {
  readonly appEnvironment: unknown;
  readonly fallbackScheme: unknown;
}): string {
  if (isAppEnvironment(appEnvironment)) {
    return CORE_SCHEMES[appEnvironment];
  }
  return normalizeCoreScheme(fallbackScheme) ?? CORE_SCHEMES.production;
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
      publicRuntime: {
        API_ENDPOINT: TEST_API_ENDPOINT,
        WS_ENDPOINT: TEST_WS_ENDPOINT,
        BACKEND_TARGET: "test",
      },
      privateRuntime: {
        STAGING_API_KEY: stagingApiKey,
      },
    };
  }

  return {
    publicRuntime: {
      API_ENDPOINT: LIVE_API_ENDPOINT,
      WS_ENDPOINT: LIVE_WS_ENDPOINT,
      BACKEND_TARGET: "live",
    },
    privateRuntime: {},
  };
}
