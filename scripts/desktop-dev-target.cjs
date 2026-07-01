#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const ROOT = path.resolve(__dirname, "..");
const LIVE_API_ENDPOINT = "https://api.6529.io";
const LIVE_WS_ENDPOINT = "wss://ws.6529.io";
const TEST_API_ENDPOINT = "https://api.staging.6529.io";
const TEST_WS_ENDPOINT = "wss://ws.staging.6529.io";
const DEV_ENVIRONMENT = "dev";
const DEV_APP_ENVIRONMENT = "local";
const DEV_CORE_SCHEME = "localcore6529";

const COMMANDS = {
  dev: {
    steps: [
      ["pnpm", ["run", "clean"]],
      ["pnpm", ["run", "build-env-schema"]],
      ["pnpm", ["run", "build-next-config"]],
      ["pnpm", ["run", "build-electron"]],
    ],
  },
  "dev-win": {
    steps: [
      ["pnpm", ["run", "clean-win"]],
      ["pnpm", ["run", "build-env-schema"]],
      ["pnpm", ["run", "build-next-config"]],
      ["pnpm", ["run", "build-electron-win"]],
    ],
  },
};

function loadLocalEnv() {
  const localEnvPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }
}

function getBackendTarget(rawTarget) {
  const target = (rawTarget ?? "live").toLowerCase();
  if (target === "live" || target === "test") {
    return target;
  }
  throw new Error("Backend target must be either live or test.");
}

function getDevEnvironment(backendTarget) {
  const stagingApiKey = process.env.STAGING_API_KEY ?? "";
  if (backendTarget === "test" && stagingApiKey.trim().length === 0) {
    throw new Error(
      "Test backend target requires STAGING_API_KEY. Add it to .env.local or export it before running dev.",
    );
  }

  const endpointEnv =
    backendTarget === "test"
      ? {
          API_ENDPOINT: TEST_API_ENDPOINT,
          WS_ENDPOINT: TEST_WS_ENDPOINT,
          STAGING_API_KEY: stagingApiKey,
        }
      : {
          API_ENDPOINT: LIVE_API_ENDPOINT,
          WS_ENDPOINT: LIVE_WS_ENDPOINT,
          STAGING_API_KEY: "",
        };

  return {
    ...process.env,
    ...endpointEnv,
    APP_ENVIRONMENT: DEV_APP_ENVIRONMENT,
    ENVIRONMENT: DEV_ENVIRONMENT,
    BACKEND_TARGET: backendTarget,
    CORE_SCHEME: DEV_CORE_SCHEME,
  };
}

function run(command, args, env) {
  const executable =
    process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function printSummary(commandName, backendTarget) {
  const apiEndpoint =
    backendTarget === "test" ? TEST_API_ENDPOINT : LIVE_API_ENDPOINT;
  const wsEndpoint =
    backendTarget === "test" ? TEST_WS_ENDPOINT : LIVE_WS_ENDPOINT;
  console.log(
    `[desktop-dev-target] ${commandName}: app=${DEV_ENVIRONMENT}, backend=${backendTarget}`,
  );
  console.log(`[desktop-dev-target] API_ENDPOINT=${apiEndpoint}`);
  console.log(`[desktop-dev-target] WS_ENDPOINT=${wsEndpoint}`);
}

function main() {
  loadLocalEnv();

  const commandName = process.argv[2];
  const commandConfig = COMMANDS[commandName];
  if (!commandConfig) {
    throw new Error(
      `Unknown desktop dev command "${commandName}". Use one of: ${Object.keys(
        COMMANDS,
      ).join(", ")}`,
    );
  }
  if (process.argv.length > 4) {
    throw new Error("Usage: 6529 run dev [live|test]");
  }

  const backendTarget = getBackendTarget(process.argv[3]);
  const env = getDevEnvironment(backendTarget);
  printSummary(commandName, backendTarget);

  for (const [command, args] of commandConfig.steps) {
    run(command, args, env);
  }
  run("pnpm", ["exec", "electron", ".", "--dev"], env);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[desktop-dev-target] ${message}`);
  process.exit(1);
}
