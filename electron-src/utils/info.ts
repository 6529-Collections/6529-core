import * as fs from "fs";
import { app } from "electron";
import databasePath from "./databasePath";
import path, { dirname } from "path";
import Logger from "electron-log";
import os from "os";

type BackendTarget = "live" | "test";

const CORE_SCHEMES = {
  local: "localcore6529",
  staging: "stagingcore6529",
  production: "core6529",
} as const;

function normalizeCoreScheme(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase().replace(/:\/\/$/, "");
  return Object.values(CORE_SCHEMES).includes(
    normalized as (typeof CORE_SCHEMES)[keyof typeof CORE_SCHEMES]
  )
    ? normalized
    : null;
}

function getPublicRuntimeConfig(): Record<string, unknown> | null {
  const runtimeConfigPath = path.join(
    app.getAppPath(),
    "main",
    "config",
    "__PUBLIC_RUNTIME.json",
  );
  try {
    return JSON.parse(fs.readFileSync(runtimeConfigPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export function getScheme() {
  const configuredScheme = normalizeCoreScheme(
    process.env.CORE_SCHEME ?? getPublicRuntimeConfig()?.CORE_SCHEME
  );
  if (configuredScheme) {
    return configuredScheme;
  }

  let scheme = "";
  const environment = getEnvironment();

  if (environment === "staging") {
    scheme = CORE_SCHEMES.staging;
  } else if (environment === "production") {
    scheme = CORE_SCHEMES.production;
  } else if (environment === "local") {
    scheme = CORE_SCHEMES.local;
  }
  return scheme;
}

export function getEnvironment(): string {
  if (process.argv.includes("--dev")) {
    return process.env.ENVIRONMENT as string;
  }

  const packageJsonPath = path.join(app.getAppPath(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  return packageJson.env.ENVIRONMENT;
}

export function getBackendTarget(): BackendTarget {
  if (process.env.BACKEND_TARGET === "test") {
    return "test";
  }
  if (process.env.BACKEND_TARGET === "live") {
    return "live";
  }

  const runtimeConfig = getPublicRuntimeConfig();
  return runtimeConfig?.BACKEND_TARGET === "test" ? "test" : "live";
}

export function getLogDirectory() {
  return dirname(getMainLogsPath());
}

export function getHomeDir() {
  return os.homedir();
}

export function getMainLogsPath() {
  return Logger.transports.file.getFile().path;
}

export function getInfo() {
  const scheme = getScheme();
  const environment = getEnvironment();
  const backendTarget = getBackendTarget();

  return {
    home_dir: getHomeDir(),
    environment,
    backend_target: backendTarget,
    app_path: app.getAppPath(),
    scheme: scheme,
    schema: scheme ? app.isDefaultProtocolClient(scheme) : "Undefined",
    user_data_path: app.getPath("userData"),
    database_path: databasePath,
    app_version: app.getVersion(),
    electron_version: process.versions.electron,
    chrome_version: process.versions.chrome,
    node_version: process.versions.node,
    os: process.platform as string,
    arch: process.arch as string,
    logs_path: getMainLogsPath(),
    logs_directory: getLogDirectory(),
    crash_reports_path: path.join(app.getPath("crashDumps")),
  };
}
