import Logger from "electron-log";
import { getInfo } from "./info";

export async function initLogs(): Promise<void> {
  const info = getInfo();
  for (const key in info) {
    Logger.info(`${key.replace("_", " ").toUpperCase()}:`, (info as any)[key]);
  }
}
