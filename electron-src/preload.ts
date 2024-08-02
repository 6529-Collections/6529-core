import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

export const api = {
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(channel, (event: IpcRendererEvent, args: any) =>
      callback(event, args)
    );
  },
  send: (channel: string, args: any): void => {
    ipcRenderer.send(channel, args);
  },
  sendSync: (channel: string, args?: any): any => {
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
  checkUpdates: () => ipcRenderer.send("check-updates"),
};

contextBridge.exposeInMainWorld("api", api);

export const store = {
  get: (key: string) => ipcRenderer.invoke("store:get", key),
  set: (key: string, value: any) => ipcRenderer.invoke("store:set", key, value),
  remove: (key: string) => ipcRenderer.invoke("store:remove", key),
};

contextBridge.exposeInMainWorld("store", store);

export type ElectronAPI = typeof api;
export type ElectronStore = typeof store;
