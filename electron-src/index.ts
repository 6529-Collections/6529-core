import { app, BrowserWindow, Menu, Notification } from "electron/main";
import path from "node:path";
import {
  closeLogs,
  extractCrashReport,
  getCrashReportsList,
  initLogs,
  openLogs,
} from "./utils/app-logs";
import {
  getHomeDir,
  getInfo,
  getLogDirectory,
  getMainLogsPath,
  getScheme,
} from "./utils/info";
import {
  addRpcProvider,
  addSeedWallet,
  deactivateRpcProvider,
  deleteRpcProvider,
  deleteSeedWallet,
  getRpcProviders,
  getSeedWallet,
  getSeedWallets,
  importSeedWallet,
  initDb,
  setRpcProviderActive,
} from "./db/db";
import { ipcMain, protocol, shell, screen, crashReporter } from "electron";
import {
  GET_SEED_WALLETS,
  ADD_SEED_WALLET,
  DELETE_SEED_WALLET,
  GET_SEED_WALLET,
  IMPORT_SEED_WALLET,
  ADD_RPC_PROVIDER,
  SET_RPC_PROVIDER_ACTIVE,
  DEACTIVATE_RPC_PROVIDER,
  DELETE_RPC_PROVIDER,
} from "../constants";
import Logger from "electron-log";
import localShortcut from "electron-localshortcut";
import { prepareNext } from "./utils/prepareNext";
import { getPort } from "get-port-please";
import { exec } from "child_process";
import { getValue, initStore, removeValue, setValue } from "./store";
import { platform } from "os";
import { menuTemplate } from "./menu";
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  isUpdateInitiatedQuit,
} from "./update";
import contextMenu from "electron-context-menu";
import { isDev } from "./utils/env";
import { ScheduledWorkerStatus, SeedWalletRequest } from "../shared/types";
import { startSchedulers, stopSchedulers } from "./scheduled-tasks/scheduler";
import fs from "fs";
import { ScheduledWorker } from "./scheduled-tasks/scheduled-worker";
import { RPCProvider } from "./db/entities/IRpcProvider";

contextMenu({
  showInspectElement: false,
  showCopyImage: true,
  showCopyImageAddress: true,
  showSaveImageAs: true,
  showSaveImage: true,
});

crashReporter.start({
  uploadToServer: false,
});

let mainWindow: BrowserWindow | null = null;
let scheduledWorkers: ScheduledWorker[] = [];
let rpcProviders: RPCProvider[] = [];
const logWindowsMap = new Map<string, BrowserWindow>();
let splash: BrowserWindow | null = null;
let iconPath: string;
let PORT: number;

const gotTheLock = app.requestSingleInstanceLock();

const shownNotifications = new Set<number>();

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
      Logger.info("Handling connector Deep Link");
      const encodedData = urlObj.searchParams.get("data");
      if (encodedData === null) {
        Logger.error("No data parameter found in the URL");
        return;
      }
      const connectionInfo = JSON.parse(encodedData);
      mainWindow?.webContents.send("wallet-connection", connectionInfo);
    } else if (urlObj.host === "navigate") {
      Logger.info("Handling navigate Deep Link", urlObj.pathname);
      mainWindow?.webContents.send("navigate", urlObj.pathname);
    }
  }

  app.on("second-instance", (_event, commandLine, _workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      const scheme = getScheme();

      const url = commandLine.find((arg) => arg.startsWith(scheme));
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

  app.on("before-quit", () => {
    Logger.info("Before quitting app");
  });

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  app.whenReady().then(async () => {
    app.setName("6529 CORE");
    const scheme = getScheme();
    protocol.handle(scheme, (_request) => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
      return new Response("App focused");
    });

    if (!app.isDefaultProtocolClient(scheme)) {
      app.setAsDefaultProtocolClient(scheme);
    }

    if (isWindows()) {
      iconPath = path.join(__dirname, "assets", "icon.ico");
    } else if (isMac()) {
      iconPath = path.join(__dirname, "assets", "icon.icns");
    } else {
      iconPath = path.join(__dirname, "assets", "icon.png");
    }

    if (isMac()) {
      app.dock.setIcon(iconPath);
    }

    await resolvePort();

    await prepareNext(PORT);
    await initLogs();
    await initDb();
    initStore();

    await createWindow();

    await createScheduledTasks();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        if (isMac()) {
          app.dock.setIcon(iconPath);
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

  splash = new BrowserWindow({
    width: 300,
    height: 300,
    frame: false,
    backgroundColor: "#222",
    transparent: true,
  });

  splash.loadFile(path.join(__dirname, "assets/splash.html"));

  mainWindow = new BrowserWindow({
    minWidth: 500,
    minHeight: 500,
    icon: iconPath,
    backgroundColor: "#222",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#000",
      symbolColor: "#fff",
      height: 30,
    },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      spellcheck: true,
    },
    show: false,
  });

  const url = `http://localhost:${PORT}/core/workers-hub`;

  mainWindow.loadURL(url);

  // TODO: Remove this, replace with commented out code above
  // mainWindow = new BrowserWindow({
  //   width: 300,
  //   height: 300,
  //   frame: false,
  //   backgroundColor: "#222",
  //   transparent: true,
  // });

  localShortcut.register("CommandOrControl+Shift+C", () => {
    mainWindow?.webContents.openDevTools();
  });

  mainWindow.once("ready-to-show", () => {
    splash?.destroy();
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on("close", (e) => {
    if (isUpdateInitiatedQuit) {
      if (isDev) {
        app.relaunch();
        app.quit();
        Logger.info("Restarting app\n---------- End of Session ----------\n\n");
      }
    } else {
      e.preventDefault();
      mainWindow?.focus();
      mainWindow?.webContents.send("app-close");
    }
  });

  process.on("uncaughtException", (error) => {
    Logger.error("Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (reason, promise) => {
    Logger.error("Unhandled Rejection at:", promise, "reason:", reason);
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

async function createScheduledTasks() {
  stopSchedulers(scheduledWorkers);
  rpcProviders = await getRpcProviders();
  const rpcProvider = rpcProviders.find((provider) => provider.active);
  scheduledWorkers = startSchedulers(
    rpcProvider?.url ?? null,
    getLogDirectory(),
    postWorkerUpdate
  );
}

protocol.registerSchemesAsPrivileged([
  { scheme: getScheme(), privileges: { secure: true, standard: true } },
]);

ipcMain.on(ADD_SEED_WALLET, (event, args) => {
  const name = args[0];
  const pass = args[1];
  Logger.info(`Creating seed wallet: ${name}`);
  addSeedWallet(name, pass)
    .then((data) => {
      event.returnValue = {
        error: false,
        data,
      };
      Logger.info(`Seed wallet created: ${name}`);
      mainWindow?.webContents.send("seed-wallets-change");
    })
    .catch((error) => {
      Logger.error(`Error creating seed wallet: ${error}`);
      event.returnValue = {
        error: true,
        data: error,
      };
    });
});

ipcMain.on(IMPORT_SEED_WALLET, (event, args) => {
  const name = args[0];
  const pass = args[1];
  const address = args[2];
  const mnemonic = args[3];
  const privateKey = args[4];
  Logger.info(`Importing seed wallet: ${name}`);
  importSeedWallet(name, pass, address, mnemonic, privateKey)
    .then(() => {
      event.returnValue = {
        error: false,
      };
      Logger.info(`Seed wallet imported: ${name}`);
      mainWindow?.webContents.send("seed-wallets-change");
    })
    .catch((error) => {
      Logger.error(`Error importing seed wallet: ${error}`);
      event.returnValue = {
        error: true,
        data: error,
      };
    });
});

ipcMain.on(GET_SEED_WALLETS, (event) => {
  getSeedWallets()
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

ipcMain.on(GET_SEED_WALLET, (event, args) => {
  const address = args[0];
  Logger.info(`Retrieving seed wallet: ${address}`);
  getSeedWallet(address)
    .then((data) => {
      Logger.info(`Seed wallet retrieved: ${address}`);
      event.returnValue = {
        error: false,
        data,
      };
    })
    .catch((error) => {
      Logger.error(`Error retrieving seed wallet: ${error}`);
      event.returnValue = {
        error: true,
        data: error,
      };
    });
});

ipcMain.on(DELETE_SEED_WALLET, (event, args) => {
  const address = args[0];
  Logger.info(`Deleting seed wallet: ${address}`);
  deleteSeedWallet(address)
    .then(() => {
      event.returnValue = {
        error: false,
      };
      Logger.info(`Seed wallet deleted: ${address}`);
      mainWindow?.webContents.send("seed-wallets-change");
    })
    .catch((error) => {
      Logger.error(`Error deleting seed wallet: ${error}`);
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
        Logger.error("Command execution failed:", error);
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
  Logger.info("Opening external URL:", url);
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

ipcMain.on("open-logs", (_event, name: string, logFile: string) => {
  let logsWindow = logWindowsMap.get(logFile);
  if (!logsWindow || logsWindow.isDestroyed()) {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    logsWindow = new BrowserWindow({
      width: width * 0.7,
      height: height * 0.7,
      x: width * 0.15,
      y: height * 0.15,
      title: name,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        spellcheck: true,
      },
    });
    logsWindow.on("closed", () => {
      closeLogs(logFile);
      logWindowsMap.delete(logFile);
    });
    openLogs(logsWindow, name, logFile);
  } else {
    logsWindow.focus();
  }
});

ipcMain.on("show-file", (event, filePath: string) => {
  event.preventDefault();
  Logger.info("Showing file:", filePath);
  if (fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
  } else {
    Logger.error(`Showing file failed: ${filePath}`);
  }
});

ipcMain.on("extract-crash-report", (event, fileName) => {
  event.preventDefault();
  extractCrashReport(fileName);
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
  stopSchedulers(scheduledWorkers);
  Logger.info("Quitting app\n---------- End of Session ----------\n\n");
  app.quit();
});

function updateNavigationState() {
  const navState = {
    canGoBack: mainWindow?.webContents.canGoBack(),
    canGoForward: mainWindow?.webContents.canGoForward(),
  };
  mainWindow?.webContents.send("nav-state-change", navState);
}

function postWorkerUpdate(
  namespace: string,
  status: ScheduledWorkerStatus,
  message: string,
  action?: string,
  progress?: number,
  target?: number,
  statusPercentage?: number
) {
  Logger.info(
    `Worker update: ${namespace} [${message}] ${action ? `[${action}]` : ""} ${
      progress ? `[${progress}/${target}]` : ""
    } ${statusPercentage ? `(${statusPercentage.toFixed(2)}%)` : ""}`
  );
  if (!mainWindow?.isDestroyed()) {
    mainWindow?.webContents?.send(
      "worker-update",
      namespace,
      status,
      message,
      action,
      progress,
      target,
      statusPercentage
    );
  }
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

ipcMain.handle("get-scheduled-workers", () => {
  const mainTask = {
    namespace: "main",
    logFile: getMainLogsPath(),
    interval: 0,
  };
  const tasks: any[] = [];
  scheduledWorkers.forEach((worker) => {
    tasks.push({
      namespace: worker.getNamespace(),
      logFile: worker.getLogFilePath(),
      interval: worker.getInterval(),
      status: worker.getStatus(),
    });
  });
  return {
    homeDir: getHomeDir(),
    mainTask,
    rpcProviders,
    tasks,
  };
});

ipcMain.handle("get-crash-reports", () => {
  return getCrashReportsList();
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

ipcMain.on(
  "notifications:show",
  (_event, id: number, pfp: string, message: string) => {
    Logger.info(`Showing notification: [${id}] ${message}, ${pfp}`);

    if (shownNotifications.has(id)) {
      Logger.info(`Notification [${id}] already shown`);
      return;
    }

    shownNotifications.add(id);

    const notification = new Notification({
      title: "You have unread notifications!",
      body: message,
      icon: pfp,
    });
    notification.on("click", () => {
      mainWindow?.webContents.send("navigate", "/my-stream/notifications");
    });
    notification.show();
  }
);

ipcMain.on("notifications:set-badge", (_event, count: number) => {
  if (count !== app.getBadgeCount()) {
    Logger.info(`Setting dock badge count: ${count}`);
    const success = app.setBadgeCount(count);
    Logger.info(
      `Dock badge count set: ${success.toString()} [Current: ${app.getBadgeCount()}]`
    );
  }
});

ipcMain.on("check-updates", () => {
  checkForUpdates(mainWindow);
});

ipcMain.on("download-update", () => {
  downloadUpdate();
});

ipcMain.on("install-update", () => {
  installUpdate();
});

ipcMain.on(
  "seed-connector-init-request",
  (_event, request: SeedWalletRequest) => {
    Logger.info(`Seed connector init request: ${request.requestId}`);
    mainWindow?.webContents.send("seed-connector-init-request", request);
  }
);

ipcMain.on(
  "seed-connector-show-toast",
  (_event, toast: { type: string; message: string }) => {
    mainWindow?.webContents.send("seed-connector-show-toast", toast);
  }
);

ipcMain.on("seed-connector-confirm", (_event, request: SeedWalletRequest) => {
  Logger.info(`Seed connector confirm: ${request.requestId}`);
  mainWindow?.webContents.send("seed-connector-confirm", request);
});

ipcMain.on("seed-connector-reject", (_event, request: SeedWalletRequest) => {
  Logger.info(`Seed connector reject: ${request.requestId}`);
  mainWindow?.webContents.send("seed-connector-reject", request);
});

ipcMain.on("seed-connector-disconnect", () => {
  Logger.info(`Seed connector disconnect`);
  mainWindow?.webContents.send("seed-connector-disconnect");
});

ipcMain.on(ADD_RPC_PROVIDER, (event, args: [string, string]) => {
  const [name, url] = args;
  Logger.info(`Adding RPC provider: ${name}-${url}`);
  addRpcProvider(name, url)
    .then(async (id) => {
      Logger.info(`RPC provider added: ${id}`);
      rpcProviders = await getRpcProviders();
      event.returnValue = {
        error: false,
        data: id,
      };
    })
    .catch((error) => {
      Logger.error(`Error adding RPC provider: ${error}`);
      event.returnValue = {
        error: true,
        data: error,
      };
    });
});

ipcMain.on(SET_RPC_PROVIDER_ACTIVE, async (event, id: number) => {
  setRpcProviderActive(id)
    .then(async () => {
      await createScheduledTasks();
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

ipcMain.on(DEACTIVATE_RPC_PROVIDER, (event, id: number) => {
  deactivateRpcProvider(id)
    .then(async () => {
      await createScheduledTasks();
      event.returnValue = { error: false };
    })
    .catch((error) => {
      event.returnValue = { error: true, data: error };
    });
});

ipcMain.on(DELETE_RPC_PROVIDER, (event, id: number) => {
  deleteRpcProvider(id)
    .then(async () => {
      rpcProviders = await getRpcProviders();
      event.returnValue = { error: false };
    })
    .catch((error) => {
      event.returnValue = { error: true, data: error };
    });
});
