import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

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
    console.log("sendSync", channel, args);
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
  removeNavigationStateChangeListener: (callback: any) =>
    ipcRenderer.removeListener("nav-state-change", callback),
  getInfo: () => ipcRenderer.invoke("get-info"),
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

export type ElectronAPI = typeof api;
export type ElectronStore = typeof store;
export type ElectronUpdater = typeof updater;
