import * as fs from "fs";
import { app } from "electron";
import databasePath from "./databasePath";
import path from "path";
import Logger from "electron-log";

export function getScheme() {
  let scheme = "";
  let environment = "";
  if (process.argv.includes("--dev")) {
    environment = process.env.ENVIRONMENT as string;
  } else {
    const packageJsonPath = path.join(app.getAppPath(), "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    environment = packageJson.env.ENVIRONMENT;
  }

  if (environment === "staging") {
    scheme = "stagingcore6529";
  } else if (environment === "production") {
    scheme = "core6529";
  }
  return scheme;
}

export function getInfo() {
  const scheme = getScheme();

  return {
    environment: process.env.ENVIRONMENT,
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
    logs_path: Logger.transports.file.getFile().path,
    crash_reports_path: path.join(app.getPath("crashDumps")),
  };
}
