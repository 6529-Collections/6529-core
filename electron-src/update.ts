import { autoUpdater } from "electron-updater";
import { isDev } from "./utils/env";
import Logger from "electron-log";

let mainWindow: Electron.BrowserWindow | null;
export let isUpdateInitiatedQuit = false;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

export function checkForUpdates(window: Electron.BrowserWindow | null) {
  Logger.info("Checking for updates");
  if (window) {
    mainWindow = window;
  }

  if (isDev) {
    mainWindow?.webContents.send("update-available", {
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
    total: 100,
  };

  const interval = setInterval(() => {
    // Increment the progress percentage
    progress.percent += 1;
    progress.bytesPerSecond = Math.random() * 1000 + 500; // simulate random download speed
    progress.transferred = (progress.percent / 100) * progress.total;

    // Send the progress update to the renderer process
    mainWindow?.webContents.send("update-progress", progress);

    // Stop the interval when progress reaches 100%
    if (progress.percent >= 100) {
      clearInterval(interval);
      mainWindow?.webContents.send("update-downloaded", {
        version: "1.0.0",
      });
    }
  }, 50);
}

autoUpdater.on("download-progress", (progress) => {
  Logger.info("Download progress", progress);
  mainWindow?.webContents.send("update-progress", progress);
});

autoUpdater.on("update-downloaded", (info) => {
  Logger.info("Update downloaded", info);
  mainWindow?.webContents.send("update-downloaded", info);
});

autoUpdater.on("error", (error) => {
  Logger.error("Update error", error);
  mainWindow?.webContents.send("update-error", error);
});

autoUpdater.on("update-not-available", (info) => {
  Logger.info("Update not available", info);
  mainWindow?.webContents.send("update-not-available", info);
});
