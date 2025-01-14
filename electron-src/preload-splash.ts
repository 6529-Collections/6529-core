import { contextBridge, ipcRenderer } from "electron";

export const splashAPI = {
  onUpdateMessage: (callback: any) =>
    ipcRenderer.on("update-message", callback),
};

contextBridge.exposeInMainWorld("splashAPI", splashAPI);
