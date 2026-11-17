import * as fs from "fs";
import classicDesktop from "../../config/classic-desktop.json";
import { app } from "electron";
import databasePath from "./databasePath";
import path, { dirname } from "path";
import Logger from "electron-log";
import os from "os";

type BackendTarget = "live" | "test";

const CORE_SCHEMES = classicDesktop.schemes;

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

export function getScheme(): string {
  // Match the scheme declared by this package. Shell overrides must not make a
  // local or staging binary claim another build's links.
  switch (getEnvironment()) {
    case "dev":
    case "local":
      return CORE_SCHEMES.local;
    case "staging":
      return CORE_SCHEMES.staging;
    case "production":
      return CORE_SCHEMES.production;
    default:
      return "";
  }
}

export function getEnvironment(): string {
  if (process.argv.includes("--dev")) {
    return process.env.ENVIRONMENT ?? "dev";
  }

  const packageJsonPath = path.join(app.getAppPath(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  return packageJson.env.ENVIRONMENT;
}

export function getBackendTarget(): BackendTarget {
  const runtimeConfig = getPublicRuntimeConfig();
  const isDevRun = process.argv.includes("--dev");

  if (isDevRun) {
    if (process.env.BACKEND_TARGET === "test") {
      return "test";
    }
    if (process.env.BACKEND_TARGET === "live") {
      return "live";
    }
  }

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
