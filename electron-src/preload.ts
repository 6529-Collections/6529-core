import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { SeedWalletRequest } from "../shared/types";

export const api = {
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(channel, (event: IpcRendererEvent, args: any) =>
      callback(event, args)
    );
  },
  send: (channel: string, ...args: any[]): void => {
    ipcRenderer.send(channel, args);
  },
  sendSync: (channel: string, ...args: any[]): any => {
    return ipcRenderer.sendSync(channel, args);
  },
  openExternal: (url: string): void => {
    ipcRenderer.send("open-external", url);
  },
  openExternalChrome: (url: string): void => {
    ipcRenderer.send("open-external-chrome", url);
  },
  openExternalFirefox: (url: string): void => {
    ipcRenderer.send("open-external-firefox", url);
  },
  openExternalBrave: (url: string): void => {
    ipcRenderer.send("open-external-brave", url);
  },
  showCrashReport: (fileName: string) => {
    ipcRenderer.send("show-crash-report", fileName);
  },
  extractCrashReport: (fileName: string) => {
    ipcRenderer.send("extract-crash-report", fileName);
  },
  onAppClose: (callback: any) => ipcRenderer.on("app-close", callback),
  runBackground: () => {
    ipcRenderer.send("run-background");
  },
  quit: () => {
    ipcRenderer.send("quit");
  },
  goBack: () => ipcRenderer.send("nav-back"),
  goForward: () => ipcRenderer.send("nav-forward"),
  getNavigationState: () => ipcRenderer.invoke("get-nav-state"),
  onNavigationStateChange: (callback: any) =>
    ipcRenderer.on("nav-state-change", callback),
  offNavigationStateChange: (callback: any) =>
    ipcRenderer.removeListener("nav-state-change", callback),
  onSeedWalletsChange: (callback: any) =>
    ipcRenderer.on("seed-wallets-change", callback),
  offSeedWalletsChange: (callback: any) =>
    ipcRenderer.removeListener("seed-wallets-change", callback),
  getInfo: () => ipcRenderer.invoke("get-info"),
  getCrashReports: () => ipcRenderer.invoke("get-crash-reports"),
  onWalletConnection: (connectionData: any) => {
    ipcRenderer.on("wallet-connection", connectionData);
  },
  handleWalletResponse: (response: any) => {
    ipcRenderer.on("wallet-response", response);
  },
  onNavigate: (url: any) => {
    ipcRenderer.on("navigate", url);
  },
  offNavigate: (callback: any) =>
    ipcRenderer.removeListener("navigate", callback),
};

contextBridge.exposeInMainWorld("api", api);

export const store = {
  get: (key: string) => ipcRenderer.invoke("store:get", key),
  set: (key: string, value: any) => ipcRenderer.invoke("store:set", key, value),
  remove: (key: string) => ipcRenderer.invoke("store:remove", key),
};

contextBridge.exposeInMainWorld("store", store);

export const updater = {
  checkUpdates: () => ipcRenderer.send("check-updates"),
  onUpdateAvailable: (data: any) => ipcRenderer.on("update-available", data),
  offUpdateAvailable: (data: any) =>
    ipcRenderer.removeListener("update-available", data),
  onUpdateNotAvailable: (data: any) =>
    ipcRenderer.on("update-not-available", data),
  offUpdateNotAvailable: (data: any) =>
    ipcRenderer.removeListener("update-not-available", data),
  onUpdateError: (error: any) => ipcRenderer.on("update-error", error),
  offUpdateError: (error: any) =>
    ipcRenderer.removeListener("update-error", error),
  onUpdateProgress: (progress: any) =>
    ipcRenderer.on("update-progress", progress),
  offUpdateProgress: (progress: any) =>
    ipcRenderer.removeListener("update-progress", progress),
  onUpdateDownloaded: (data: any) => ipcRenderer.on("update-downloaded", data),
  offUpdateDownloaded: (data: any) =>
    ipcRenderer.removeListener("update-downloaded", data),
  downloadUpdate: () => ipcRenderer.send("download-update"),
  installUpdate: () => ipcRenderer.send("install-update"),
};

contextBridge.exposeInMainWorld("updater", updater);

export const seedConnector = {
  initRequest: (request: SeedWalletRequest) => {
    ipcRenderer.send("seed-connector-init-request", request);
  },
  onInitRequest: (callback: any) => {
    ipcRenderer.on("seed-connector-init-request", callback);
  },
  offInitRequest: (callback: any) => {
    ipcRenderer.removeListener("seed-connector-init-request", callback);
  },
  showToast: (toast: { type: string; message: string }) => {
    ipcRenderer.send("seed-connector-show-toast", toast);
  },
  onShowToast: (callback: any) => {
    ipcRenderer.on("seed-connector-show-toast", callback);
  },
  offShowToast: (callback: any) => {
    ipcRenderer.removeListener("seed-connector-show-toast", callback);
  },
  confirm: (request: SeedWalletRequest) => {
    ipcRenderer.send("seed-connector-confirm", request);
  },
  onConfirm: (callback: any) => {
    ipcRenderer.on("seed-connector-confirm", callback);
  },
  offConfirm: (callback: any) => {
    ipcRenderer.removeListener("seed-connector-confirm", callback);
  },
  reject: (request: SeedWalletRequest) => {
    ipcRenderer.send("seed-connector-reject", request);
  },
  onReject: (callback: any) => {
    ipcRenderer.on("seed-connector-reject", callback);
  },
  offReject: (callback: any) => {
    ipcRenderer.removeListener("seed-connector-reject", callback);
  },
  disconnect: () => {
    ipcRenderer.send("seed-connector-disconnect");
  },
  onDisconnect: (callback: any) => {
    ipcRenderer.on("seed-connector-disconnect", callback);
  },
  offDisconnect: (callback: any) => {
    ipcRenderer.removeListener("seed-connector-disconnect", callback);
  },
};

contextBridge.exposeInMainWorld("seedConnector", seedConnector);

export type ElectronAPI = typeof api;
export type ElectronStore = typeof store;
export type ElectronUpdater = typeof updater;
export type ElectronSeedConnector = typeof seedConnector;
