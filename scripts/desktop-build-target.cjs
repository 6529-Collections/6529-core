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

const COMMANDS = {
  "dist-win-staging": {
    appEnvironment: "staging",
    prebuild: [["pnpm", ["run", "download-signed-ipfs"]]],
    build: ["pnpm", ["run", "build-win"]],
    electronBuilder: [
      "--config",
      "electron-builder.staging.json",
      "--win",
      "--x64",
      "--publish",
      "never",
    ],
  },
  "dist-win-production": {
    appEnvironment: "production",
    prebuild: [["pnpm", ["run", "download-signed-ipfs"]]],
    build: ["pnpm", ["run", "build-win"]],
    electronBuilder: [
      "--config",
      "electron-builder.production.json",
      "--win",
      "--x64",
      "--arm64",
      "--publish",
      "never",
    ],
  },
  "dist-mac-local": {
    appEnvironment: "local",
    env: { NEXT_LOCAL_DEBUG: "true" },
    build: ["pnpm", ["run", "build"]],
    electronBuilder: [
      "--config",
      "electron-builder.local.json",
      "--mac",
      "--arm64",
      "--dir",
      "--publish",
      "never",
    ],
  },
  "dist-mac-staging": {
    appEnvironment: "staging",
    build: ["pnpm", ["run", "build"]],
    electronBuilder: [
      "--config",
      "electron-builder.staging.json",
      "--mac",
      "--arm64",
      "--publish",
      "always",
    ],
  },
  "dist-mac-production": {
    appEnvironment: "production",
    build: ["pnpm", ["run", "build"]],
    electronBuilder: [
      "--config",
      "electron-builder.production.json",
      "--mac",
      "--arm64",
      "--x64",
      "--publish",
      "always",
    ],
  },
  "dist-mac-production-x64": {
    appEnvironment: "production",
    build: ["pnpm", ["run", "build"]],
    electronBuilder: [
      "--config",
      "electron-builder.production-mac-x64.json",
      "--mac",
      "--publish",
      "never",
    ],
  },
  "dist-mac-production-arm64": {
    appEnvironment: "production",
    build: ["pnpm", ["run", "build"]],
    electronBuilder: [
      "--config",
      "electron-builder.production-mac-arm64.json",
      "--mac",
      "--publish",
      "never",
    ],
  },
  "dist-linux-staging": {
    appEnvironment: "staging",
    build: ["pnpm", ["run", "build"]],
    electronBuilder: [
      "--config",
      "electron-builder.staging.json",
      "--linux",
      "--x64",
      "--publish",
      "always",
    ],
  },
  "dist-linux-production": {
    appEnvironment: "production",
    build: ["pnpm", ["run", "build"]],
    electronBuilder: [
      "--config",
      "electron-builder.production.json",
      "--linux",
      "--x64",
      "--publish",
      "always",
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

function getBuildEnvironment(commandConfig, backendTarget) {
  const stagingApiKey = process.env.STAGING_API_KEY ?? "";
  if (
    commandConfig.appEnvironment === "production" &&
    backendTarget === "test"
  ) {
    throw new Error(
      "Production app environment cannot be built against Test backend."
    );
  }
  if (backendTarget === "test" && stagingApiKey.trim().length === 0) {
    throw new Error(
      "Test backend target requires STAGING_API_KEY. Add it to .env.local or export it before building."
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
    ...commandConfig.env,
    ...endpointEnv,
    APP_ENVIRONMENT: commandConfig.appEnvironment,
    BACKEND_TARGET: backendTarget,
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

function printSummary(commandName, commandConfig, backendTarget) {
  const apiEndpoint =
    backendTarget === "test" ? TEST_API_ENDPOINT : LIVE_API_ENDPOINT;
  const wsEndpoint =
    backendTarget === "test" ? TEST_WS_ENDPOINT : LIVE_WS_ENDPOINT;
  console.log(
    `[desktop-build-target] ${commandName}: app=${commandConfig.appEnvironment}, backend=${backendTarget}`
  );
  console.log(`[desktop-build-target] API_ENDPOINT=${apiEndpoint}`);
  console.log(`[desktop-build-target] WS_ENDPOINT=${wsEndpoint}`);
}

function main() {
  loadLocalEnv();

  const commandName = process.argv[2];
  const commandConfig = COMMANDS[commandName];
  if (!commandConfig) {
    throw new Error(
      `Unknown desktop build command "${commandName}". Use one of: ${Object.keys(
        COMMANDS
      ).join(", ")}`
    );
  }
  if (process.argv.length > 4) {
    throw new Error("Usage: 6529 run <dist-script> [live|test]");
  }

  const backendTarget = getBackendTarget(process.argv[3]);
  const env = getBuildEnvironment(commandConfig, backendTarget);
  printSummary(commandName, commandConfig, backendTarget);

  for (const [command, args] of commandConfig.prebuild ?? []) {
    run(command, args, env);
  }
  run(commandConfig.build[0], commandConfig.build[1], env);
  run(
    "pnpm",
    ["exec", "electron-builder", ...commandConfig.electronBuilder],
    env
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[desktop-build-target] ${message}`);
  process.exit(1);
}
