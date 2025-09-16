import { contextBridge, ipcRenderer } from "electron";

const versionArg = process.argv.find((arg) => arg.startsWith("--app-version="));
const appVersion = versionArg ? versionArg.split("=")[1] : "";

export const splashAPI = {
  version: appVersion,
  onUpdateMessage: (callback: any) =>
    ipcRenderer.on("update-message", callback),
};

contextBridge.exposeInMainWorld("splashAPI", splashAPI);
