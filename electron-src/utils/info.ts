import { app } from "electron";
import databasePath from "./databasePath";

export function getInfo() {
  return {
    app_path: app.getAppPath(),
    schema: app.isDefaultProtocolClient("core6529"),
    user_data_path: app.getPath("userData"),
    database_path: databasePath,
    app_version: app.getVersion(),
    electron_version: process.versions.electron,
    chrome_version: process.versions.chrome,
    node_version: process.versions.node,
    os: process.platform as string,
    arch: process.arch as string,
  };
}
