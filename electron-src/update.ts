import { dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { isDev } from "./utils/env";
import Logger from "electron-log";

let updateCheckInProgress = false;

export function checkForUpdates(manual: boolean = false) {
  if (isDev) {
    Logger.info("Skipping update check in development mode");

    if (manual) {
      dialog.showErrorBox(
        "Update Not Supported",
        "You're running in development mode"
      );
    }
    return;
  }

  if (updateCheckInProgress) {
    return;
  }

  updateCheckInProgress = manual;

  autoUpdater.checkForUpdates();
}

autoUpdater.on("update-available", (info) => {
  updateCheckInProgress = false;
  dialog
    .showMessageBox({
      type: "info",
      title: "Update Available",
      message: `Version v${info.version} is available, do you want to download it now?`,
      buttons: ["Yes", "No"],
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
});

autoUpdater.on("update-downloaded", (info) => {
  dialog
    .showMessageBox({
      type: "info",
      title: "Update Ready",
      message: `Version -${info.version} has been downloaded. Would you like to install it now?`,
      buttons: ["Install and Restart", "Later"],
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
});

autoUpdater.on("error", (err) => {
  dialog.showErrorBox(
    "Error: ",
    err == null ? "unknown" : (err.stack ?? err).toString()
  );
});

autoUpdater.on("update-not-available", (info) => {
  if (updateCheckInProgress) {
    updateCheckInProgress = false;
    dialog.showMessageBox({
      type: "info",
      title: "No Update Available",
      message: `You're already running the latest version - v${info.version}.`,
      buttons: ["OK"],
    });
  }
});
