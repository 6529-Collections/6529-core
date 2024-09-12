import { autoUpdater } from "electron-updater";
import { isDev } from "./utils/env";
import Logger from "electron-log";

let mainWindow: Electron.BrowserWindow | null;
export let isUpdateInitiatedQuit = false;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

export function checkForUpdates(window: Electron.BrowserWindow | null) {
  if (window) {
    mainWindow = window;
  }

  if (isDev) {
    mainWindow?.webContents.send("update-not-available", {
      version: "1.0.0",
      files: [],
    });
  } else {
    autoUpdater.checkForUpdates();
  }
}

export function downloadUpdate() {
  Logger.info("Downloading update");
  if (isDev) {
    simulateDownloadProgress();
  } else {
    autoUpdater.downloadUpdate();
  }
}

export function installUpdate() {
  Logger.info("Installing update");
  isUpdateInitiatedQuit = true;
  if (isDev) {
    mainWindow?.emit("close");
  } else {
    autoUpdater.quitAndInstall();
  }
}

autoUpdater.on("update-available", (info) => {
  Logger.info("Update available", info);
  mainWindow?.webContents.send("update-available", info);
});

function simulateDownloadProgress() {
  let progress = {
    percent: 0,
    bytesPerSecond: 0,
    transferred: 0,
    total: 300 * 1024 * 1024, // 300MB in bytes
  };

  const interval = setInterval(() => {
    progress.bytesPerSecond =
      Math.random() * (5 * 1024 * 1024 - 1 * 1024 * 1024) + 1 * 1024 * 1024;

    progress.transferred += progress.bytesPerSecond * 0.05;

    progress.percent = (progress.transferred / progress.total) * 100;

    if (progress.percent > 100) {
      progress.percent = 100;
      progress.transferred = progress.total;
    }

    mainWindow?.webContents.send("update-progress", progress);

    if (progress.percent >= 100) {
      clearInterval(interval);
      mainWindow?.webContents.send("update-downloaded", {
        version: "1.0.0",
      });
    }
  }, 1);
}

autoUpdater.on("download-progress", (progress) => {
  Logger.info("Download progress", progress);
  mainWindow?.webContents.send("update-progress", progress);
});

autoUpdater.on("update-downloaded", (info) => {
  Logger.info("Update downloaded", info);
  mainWindow?.webContents.send("update-downloaded", info.version);
});

autoUpdater.on("error", (error) => {
  Logger.error("Update error", error);
  mainWindow?.webContents.send("update-error", error);
});

autoUpdater.on("update-not-available", (info) => {
  Logger.info("Update not available", info.version);
  mainWindow?.webContents.send("update-not-available", info);
});
