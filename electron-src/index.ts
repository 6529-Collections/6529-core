import { app, BrowserWindow } from "electron/main";
import path from "node:path";
import { initLogs } from "./utils/initLogs";
import { getInfo } from "./utils/info";
import {
  addCustomWallet,
  deleteCustomWallet,
  getCustomWallet,
  initDb,
} from "./db";
import { ipcMain, protocol, shell } from "electron";
import {
  GET_CUSTOM_WALLET,
  ADD_CUSTOM_WALLET,
  DELETE_CUSTOM_WALLET,
} from "../constants";
import Logger from "electron-log";
import localShortcut from "electron-localshortcut";
import { prepareNext } from "./utils/prepareNext";
import { getPort } from "get-port-please";
import { exec } from "child_process";
import { getValue, initStore, removeValue, setValue } from "./store";
import { platform } from "os";

let mainWindow: BrowserWindow | null = null;
let PORT: number;

const gotTheLock = app.requestSingleInstanceLock();

async function resolvePort() {
  if (!PORT) {
    PORT = await getPort({
      random: true,
      port: 6529,
      portRange: [3000, 8000],
    });
    Logger.info("PORT:", PORT);
  }
}

function isWindows(): boolean {
  return platform() === "win32";
}

function isMac(): boolean {
  return platform() === "darwin";
}

if (!gotTheLock) {
  app.quit();
} else {
  function handleUrl(url: string) {
    const urlObj = new URL(url);

    if (urlObj.host === "connector") {
      const encodedData = urlObj.searchParams.get("data");
      if (encodedData === null) {
        console.error("No data parameter found in the URL");
        return;
      }
      const connectionInfo = JSON.parse(encodedData);
      mainWindow?.webContents.send("wallet-connection", connectionInfo);
    }
  }

  app.on("second-instance", (_event, commandLine, _workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      const url = commandLine.find((arg) => arg.startsWith("core6529://"));
      if (url) {
        handleUrl(url);
      }
    }
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleUrl(url);
  });

  app.on("window-all-closed", () => {
    Logger.info("All windows closed");
  });

  app.whenReady().then(async () => {
    app.setName("6529 CORE");
    protocol.handle("core6529", (_request) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
      return new Response("App focused");
    });

    if (!app.isDefaultProtocolClient("core6529")) {
      app.setAsDefaultProtocolClient("core6529");
    }

    if (isMac()) {
      app.dock.setIcon(path.join(__dirname, "assets", "icon.icns"));
    }

    await resolvePort();

    await prepareNext(PORT);
    await initLogs();
    initDb();
    initStore();

    await createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        if (isMac()) {
          app.dock.setIcon(path.join(__dirname, "assets", "icon.icns"));
        }
        createWindow();
      }
    });
  });
}

async function createWindow() {
  let iconPath;
  if (isWindows()) {
    iconPath = path.join(__dirname, "assets", "icon.ico");
  } else if (isMac()) {
    iconPath = path.join(__dirname, "assets", "icon.icns");
  } else {
    iconPath = path.join(__dirname, "assets", "icon.png");
  }

  mainWindow = new BrowserWindow({
    minWidth: 900,
    minHeight: 700,
    icon: iconPath,
    backgroundColor: "#222",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const url = `http://localhost:${PORT}`;

  mainWindow.loadURL(url);

  localShortcut.register("CommandOrControl+Shift+C", () => {
    mainWindow?.webContents.openDevTools();
  });

  mainWindow.maximize();

  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow?.webContents.send("app-close");
  });

  mainWindow.webContents.on("did-navigate", updateNavigationState);
  mainWindow.webContents.on("did-navigate-in-page", updateNavigationState);

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      Logger.error(
        `Failed to load URL: ${validatedURL}, Error Code: ${errorCode}, Description: ${errorDescription}`
      );
    }
  );
}

protocol.registerSchemesAsPrivileged([
  { scheme: "core6529", privileges: { secure: true, standard: true } },
]);

ipcMain.on(ADD_CUSTOM_WALLET, (event) => {
  addCustomWallet()
    .then((data) => {
      event.returnValue = {
        error: false,
        data,
      };
    })
    .catch((error) => {
      event.returnValue = {
        error: true,
        data: error,
      };
    });
});

ipcMain.on(GET_CUSTOM_WALLET, (event) => {
  getCustomWallet()
    .then((data) => {
      event.returnValue = {
        error: false,
        data,
      };
    })
    .catch((error) => {
      event.returnValue = {
        error: true,
        data: error,
      };
    });
});

ipcMain.on(DELETE_CUSTOM_WALLET, (event) => {
  deleteCustomWallet()
    .then(() => {
      event.returnValue = {
        error: false,
      };
    })
    .catch((error) => {
      event.returnValue = {
        error: true,
        data: error,
      };
    });
});

function executeCommand(command: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        console.error("Command execution failed:", error);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function openInChrome(url: string): Promise<void> {
  let command: string;

  if (isMac()) {
    command = `google-chrome "${url}" || open -a "Google Chrome" "${url}"`;
  } else if (isWindows()) {
    command = `start chrome "${url}"`;
  } else {
    command = `google-chrome "${url}" || xdg-open "${url}"`;
  }

  return executeCommand(command);
}

function openInFirefox(url: string): Promise<void> {
  let command: string;

  if (isMac()) {
    command = `firefox "${url}" || open -a "Firefox" "${url}"`;
  } else if (isWindows()) {
    command = `start firefox "${url}"`;
  } else {
    command = `firefox "${url}" || xdg-open "${url}"`;
  }

  return executeCommand(command);
}

function openInBrave(url: string): Promise<void> {
  let command: string;

  if (isMac()) {
    command = `brave-browser "${url}" || open -a "Brave Browser" "${url}"`;
  } else if (isWindows()) {
    command = `start brave "${url}"`;
  } else {
    command = `brave-browser "${url}" || xdg-open "${url}"`;
  }

  return executeCommand(command);
}

ipcMain.on("open-external", (event, url) => {
  event.preventDefault();
  console.info("Opening external URL:", url);
  shell.openExternal(url);
});

ipcMain.on("open-external-chrome", (event, url) => {
  event.preventDefault();
  Logger.info("Opening external URL in Chrome:", url);
  openInChrome(url);
});

ipcMain.on("open-external-firefox", (event, url) => {
  event.preventDefault();
  Logger.info("Opening external URL in Firefox:", url);
  openInFirefox(url);
});

ipcMain.on("open-external-brave", (event, url) => {
  event.preventDefault();
  Logger.info("Opening external URL in Brave:", url);
  openInBrave(url);
});

ipcMain.on("run-background", () => {
  Logger.info("Running in background");
  mainWindow?.close();
  mainWindow?.destroy();
});

ipcMain.on("quit", () => {
  mainWindow?.close();
  mainWindow?.destroy();
  mainWindow = null;
  app.quit();
});

function updateNavigationState() {
  const navState = {
    canGoBack: mainWindow?.webContents.canGoBack(),
    canGoForward: mainWindow?.webContents.canGoForward(),
  };
  mainWindow?.webContents.send("nav-state-change", navState);
}

ipcMain.on("nav-back", () => {
  if (mainWindow?.webContents.canGoBack()) {
    mainWindow.webContents.goBack();
  }
});

ipcMain.on("nav-forward", () => {
  if (mainWindow?.webContents.canGoForward()) {
    mainWindow.webContents.goForward();
  }
});

ipcMain.handle("get-nav-state", () => {
  return {
    canGoBack: mainWindow?.webContents.canGoBack(),
    canGoForward: mainWindow?.webContents.canGoForward(),
  };
});

ipcMain.handle("get-info", () => {
  return {
    ...getInfo(),
    port: PORT,
  };
});

ipcMain.handle("store:get", (_event, key) => {
  return getValue(key);
});

ipcMain.handle("store:set", (_event, key, value) => {
  setValue(key, value);
});

ipcMain.handle("store:remove", (_event, key) => {
  removeValue(key);
});
