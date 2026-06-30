import { contextBridge, ipcRenderer } from "electron";

const versionArg = process.argv.find((arg) => arg.startsWith("--app-version="));
const appVersion = versionArg ? versionArg.split("=")[1] : "";

const environmentArg = process.argv.find((arg) =>
  arg.startsWith("--app-environment=")
);
const appEnvironment = environmentArg ? environmentArg.split("=")[1] : "";

const hasSavedCardArg = process.argv.find((arg) =>
  arg.startsWith("--has-saved-card=")
);
const hasSavedCard = hasSavedCardArg
  ? hasSavedCardArg.split("=")[1] === "true"
  : false;

export const splashAPI = {
  version: appVersion,
  environment: appEnvironment,
  hasSavedCard,
  onUpdateMessage: (callback: any) =>
    ipcRenderer.on("update-message", callback),
  onSplashCard: (callback: (event: unknown, card: unknown) => void) =>
    ipcRenderer.on("splash-card", callback),
};

contextBridge.exposeInMainWorld("splashAPI", splashAPI);
