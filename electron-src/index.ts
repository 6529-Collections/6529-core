import { exec } from "child_process";
import {
  crashReporter,
  ipcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  protocol,
  screen,
  shell,
} from "electron";
import contextMenu from "electron-context-menu";
import localShortcut from "electron-localshortcut";
import Logger from "electron-log";
import { app, BrowserWindow, Menu, Notification } from "electron/main";
import fs from "fs";
import { getPort } from "get-port-please";
import path from "node:path";
import { platform } from "os";
import { Tail } from "tail";
import {
  ADD_RPC_PROVIDER,
  ADD_SEED_WALLET,
  DEACTIVATE_RPC_PROVIDER,
  DELETE_RPC_PROVIDER,
  DELETE_SEED_WALLET,
  GET_SEED_WALLET,
  GET_SEED_WALLETS,
  IMPORT_SEED_WALLET,
  MANUAL_START_WORKER,
  RECALCULATE_TRANSACTIONS_OWNERS,
  RESET_TRANSACTIONS_TO_BLOCK,
  RESET_WORKER,
  SET_RPC_PROVIDER_ACTIVE,
  STOP_WORKER,
} from "../electron-constants";
import { ScheduledWorkerStatus, SeedWalletRequest } from "../shared/types";
import {
  addRpcProvider,
  addSeedWallet,
  deactivateRpcProvider,
  deleteRpcProvider,
  deleteSeedWallet,
  getDb,
  getRpcProviders,
  getSeedWallet,
  getSeedWallets,
  importSeedWallet,
  initDb,
  setRpcProviderActive,
} from "./db/db";
import { runCoreMigrations } from "./db/db.migrations";
import { RPCProvider } from "./db/entities/IRpcProvider";
import IPFSServer from "./ipfs/ipfs.server";
import { menuTemplate } from "./menu";
import {
  ResettableScheduledWorker,
  ScheduledWorker,
  TransactionsScheduledWorker,
} from "./scheduled-tasks/scheduled-worker";
import { startSchedulers, stopSchedulers } from "./scheduled-tasks/scheduler";
import { getValue, initStore, removeValue, setValue } from "./store";
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  isUpdateInitiatedQuit,
} from "./update";
import {
  closeLogs,
  extractCrashReport,
  getCrashReportsList,
  initLogs,
  openLogs,
} from "./utils/app-logs";
import { isDev } from "./utils/env";
import {
  getHomeDir,
  getInfo,
  getLogDirectory,
  getMainLogsPath,
  getScheme,
} from "./utils/info";
import { prepareNext } from "./utils/prepareNext";

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

let PORT: number;

let IPFS_PORT: number;
let IPFS_RPC_PORT: number;
let IPFS_SWARM_PORT: number;
let IPFS_SERVER: IPFSServer;

const gotTheLock = app.requestSingleInstanceLock();

const shownNotifications = new Set<number>();

interface TailInstances {
  [filePath: string]: Tail;
}

const tails: TailInstances = {};

async function resolvePorts() {
  if (!PORT) {
    PORT = await getPort({
      random: true,
      port: 6529,
      portRange: [3000, 8000],
    });
    Logger.info("PORT:", PORT);
  }
  if (!IPFS_PORT) {
    IPFS_PORT = await getPort({
      random: true,
      port: 9255,
      portRange: [3000, 8000],
    });
    Logger.info("IPFS_PORT:", IPFS_PORT);
  }
  if (!IPFS_RPC_PORT) {
    IPFS_RPC_PORT = await getPort({
      random: true,
      port: 9256,
      portRange: [3000, 8000],
    });
    Logger.info("IPFS_RPC_PORT:", IPFS_RPC_PORT);
  }
  if (!IPFS_SWARM_PORT) {
    IPFS_SWARM_PORT = await getPort({
      random: true,
      port: 9257,
      portRange: [3000, 8000],
    });
    Logger.info("IPFS_SWARM_PORT:", IPFS_SWARM_PORT);
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
      Logger.info(
        `Handling navigate Deep Link: ${
          urlObj.pathname
        }?${urlObj.searchParams.toString()}`
      );
      mainWindow?.webContents.send(
        "navigate",
        `${urlObj.pathname}?${urlObj.searchParams.toString()}`
      );
    } else {
      Logger.info("Unknown Deep Link", urlObj);
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
    app.setName("6529 Desktop");
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

    if (isMac() && isDev) {
      app.dock?.setIcon(path.join(__dirname, "assets", "icon.icns"));
    }

    await resolvePorts();

    await prepareNext(PORT);
    await initLogs();
    initStore();

    IPFS_SERVER = new IPFSServer(IPFS_PORT, IPFS_RPC_PORT, IPFS_SWARM_PORT);

    await createWindow();

    app.on("activate", async () => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        await createWindow();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });
}

function createSplash() {
  splash = new BrowserWindow({
    width: 300,
    height: 300,
    frame: false,
    backgroundColor: "#222",
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, "preload-splash.js"),
      additionalArguments: [`--app-version=${app.getVersion()}`],
    },
  });
  const splashPath = path.join(__dirname, "assets", "splash.html");
  const splashURL = `file://${splashPath}`;
  splash.loadURL(splashURL);
}

function updateSplashMessage(newMessage: string) {
  if (splash && splash.webContents) {
    splash.webContents.send("update-message", newMessage);
  }
}

async function createWindow() {
  Logger.info("Creating window");
  if (mainWindow && !mainWindow.isDestroyed()) {
    Logger.info("Window already exists");
    return;
  }

  let iconPath: string;
  if (isWindows()) {
    iconPath = path.join(__dirname, "assets", "icon.ico");
  } else if (isMac()) {
    iconPath = path.join(__dirname, "assets", "icon.icns");
  } else {
    iconPath = path.join(__dirname, "assets", "icon.png");
  }

  Logger.info("Creating splash");
  if (!splash) {
    Logger.info("Splash does not exist, creating");
    createSplash();
  }

  updateSplashMessage("Initializing Database");
  await initDb();

  updateSplashMessage("Running Database Migrations");
  await runCoreMigrations(getDb());

  updateSplashMessage("Initializing IPFS");
  await IPFS_SERVER.init(PORT);

  const windowState = getValue("window-state");

  updateSplashMessage("Creating main window");
  Logger.info("Creating main window");
  mainWindow = new BrowserWindow({
    x: windowState?.x ?? undefined,
    y: windowState?.y ?? undefined,
    width: windowState?.width ?? 500,
    height: windowState?.height ?? 500,
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

  updateSplashMessage("Loading main window");

  const url = `http://localhost:${PORT}`;

  mainWindow.loadURL(url);

  localShortcut.register("CommandOrControl+Shift+C", () => {
    mainWindow?.webContents.openDevTools();
  });

  localShortcut.register("CommandOrControl+F", () => {
    mainWindow?.webContents.send("open-search");
  });

  mainWindow.once("ready-to-show", async () => {
    Logger.info("Main window ready to show");
    await createScheduledTasks();
    if (windowState) {
      mainWindow?.setBounds(windowState);
    } else {
      mainWindow?.maximize();
    }
    mainWindow?.show();
    splash?.destroy();
    splash = null;
  });

  mainWindow.on("close", (e) => {
    Logger.info("Main window closing");
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

  initListeners(mainWindow);
}

function initListeners(mw: BrowserWindow) {
  mw.webContents.on("did-navigate", updateNavigationState);
  mw.webContents.on("did-navigate-in-page", updateNavigationState);
  mw.webContents.on(
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
  if (url.startsWith(IPFS_SERVER.getApiEndpoint())) {
    // Open IPFS endpoint in an Electron BrowserWindow that mirrors the main window's size/state
    const bounds = mainWindow?.getBounds();
    const isFullScreen = mainWindow?.isFullScreen() ?? false;
    const isMaximized = mainWindow?.isMaximized() ?? false;

    const ipfsWindow = new BrowserWindow({
      x: bounds?.x ?? undefined,
      y: bounds?.y ?? undefined,
      width: bounds?.width ?? 1200,
      height: bounds?.height ?? 800,
      backgroundColor: "#222",
      titleBarStyle: "hidden",
      titleBarOverlay: { color: "#000", symbolColor: "#fff", height: 30 },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        spellcheck: true,
      },
      show: false,
    });

    if (isFullScreen) {
      ipfsWindow.setFullScreen(true);
    } else if (isMaximized) {
      ipfsWindow.maximize();
    }

    ipfsWindow.once("ready-to-show", () => {
      ipfsWindow.show();
    });

    ipfsWindow.loadURL(url);
  } else {
    shell.openExternal(url);
  }
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
  Logger.info("Opening file:", filePath);
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

  if (mainWindow) {
    mainWindow.webContents.removeAllListeners();

    for (const logFile of logWindowsMap.keys()) {
      closeLogs(logFile);
      logWindowsMap.delete(logFile);
    }
    for (const k of Object.keys(tails)) {
      tails[k].unwatch();
      delete tails[k];
    }

    if (!splash) {
      createSplash();
    }
    splash?.minimize();
    splash?.on("restore", async () => {
      Logger.info("Splash window restored");
      await createWindow();
    });

    mainWindow?.close();
    mainWindow?.destroy();
    mainWindow = null;
  }
});

ipcMain.on("quit", async () => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    setValue("window-state", {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: mainWindow.isMaximized(),
    });
  }

  mainWindow?.webContents.removeAllListeners();
  mainWindow?.close();
  mainWindow?.destroy();
  mainWindow = null;
  await stopSchedulers(scheduledWorkers);
  await IPFS_SERVER.shutdown();
  Logger.info("Quitting app\n---------- End of Session ----------\n\n");
  app.quit();
});

function updateNavigationState() {
  const navState = {
    canGoBack: mainWindow?.webContents.navigationHistory.canGoBack(),
    canGoForward: mainWindow?.webContents.navigationHistory.canGoForward(),
  };
  mainWindow?.webContents.send("nav-state-change", navState);
}

function postWorkerUpdate(
  namespace: string,
  status: ScheduledWorkerStatus,
  message: string,
  action?: string,
  statusPercentage?: number
) {
  if (!mainWindow?.isDestroyed()) {
    mainWindow?.webContents?.send(
      "worker-update",
      namespace,
      status,
      message,
      action,
      statusPercentage
    );
  }
}

ipcMain.on("nav-back", () => {
  if (mainWindow?.webContents.navigationHistory.canGoBack()) {
    mainWindow.webContents.navigationHistory.goBack();
  }
});

ipcMain.on("nav-forward", () => {
  if (mainWindow?.webContents.navigationHistory.canGoForward()) {
    mainWindow.webContents.navigationHistory.goForward();
  }
});

ipcMain.handle("get-nav-state", () => {
  return {
    canGoBack: mainWindow?.webContents.navigationHistory.canGoBack(),
    canGoForward: mainWindow?.webContents.navigationHistory.canGoForward(),
  };
});

ipcMain.handle("get-info", () => {
  return {
    ...getInfo(),
    port: PORT,
    ipfsPort: IPFS_PORT,
    ipfsRpcPort: IPFS_RPC_PORT,
    ipfsSwarmPort: IPFS_SWARM_PORT,
  };
});

ipcMain.handle("get-ipfs-info", () => {
  return {
    apiEndpoint: IPFS_SERVER.getApiEndpoint(),
    gatewayEndpoint: IPFS_SERVER.getGatewayEndpoint(),
    mfsPath: IPFS_SERVER.getMfsPath(),
  };
});

ipcMain.handle("get-main-worker", () => {
  const mainTask = {
    namespace: "6529 Desktop",
    display: "6529 Desktop",
    logFile: getMainLogsPath(),
    cronExpression: null,
  };
  return {
    homeDir: getHomeDir(),
    mainTask,
  };
});

ipcMain.handle("get-scheduled-workers", () => {
  const tasks: any[] = [];
  scheduledWorkers.forEach((worker) => {
    const task: any = {
      namespace: worker.getNamespace(),
      display: worker.getDisplay(),
      logFile: worker.getLogFilePath(),
      cronExpression: worker.getCronExpression(),
      status: worker.getStatus(),
      description: worker.getDescription(),
      resetable: worker instanceof ResettableScheduledWorker,
    };
    tasks.push(task);
  });
  return {
    homeDir: getHomeDir(),
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
  (
    _event,
    id: number,
    pfp: string,
    title: string,
    body: string,
    redirectPath: string
  ) => {
    Logger.info(`Showing notification: [${id}] ${title} - ${body}, ${pfp}`);

    if (shownNotifications.has(id)) {
      Logger.info(`Notification [${id}] already shown`);
      return;
    }

    shownNotifications.add(id);

    const notification = new Notification({
      title,
      body,
      icon: pfp,
    });
    notification.on("click", () => {
      mainWindow?.webContents.send(
        "navigate",
        redirectPath || "/notifications"
      );
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

ipcMain.on(MANUAL_START_WORKER, (event, namespace: string) => {
  const worker = scheduledWorkers.find(
    (worker) => worker.getNamespace() === namespace[0]
  );
  let status: boolean;
  if (worker) {
    status = worker.manualStart();
    event.returnValue = { error: !status };
  } else {
    event.returnValue = { error: true, data: "Worker not found" };
  }
});

ipcMain.on(RESET_TRANSACTIONS_TO_BLOCK, (event, args: [string, number]) => {
  const [namespace, blockNo] = args;
  Logger.info(`[${namespace}] Reset to block: ${blockNo}`);
  const transactionsWorker = scheduledWorkers.find(
    (worker) =>
      worker instanceof TransactionsScheduledWorker &&
      worker.getNamespace() === namespace
  ) as TransactionsScheduledWorker | undefined;
  if (!transactionsWorker) {
    event.returnValue = {
      error: true,
      data: "Transactions worker not found",
    };
  } else {
    transactionsWorker.resetToBlock(blockNo).then((data) => {
      event.returnValue = { error: !data.status, data: data.message };
    });
  }
});

ipcMain.on(RECALCULATE_TRANSACTIONS_OWNERS, (event) => {
  Logger.info(`Recalculating owners`);
  const transactionsWorker = scheduledWorkers.find(
    (worker) => worker instanceof TransactionsScheduledWorker
  );
  if (!transactionsWorker) {
    event.returnValue = { error: true, data: "Transactions worker not found" };
  } else {
    transactionsWorker.recalculateTransactionsOwners().then((data) => {
      event.returnValue = { error: !data.status, data: data.message };
    });
  }
});

ipcMain.on(RESET_WORKER, (event, args: [string]) => {
  const [namespace] = args;
  Logger.info(`[${namespace}] Reset worker`);
  const worker = scheduledWorkers.find(
    (worker) =>
      worker instanceof ResettableScheduledWorker &&
      worker.getNamespace() === namespace
  ) as ResettableScheduledWorker | undefined;
  if (!worker) {
    event.returnValue = {
      error: true,
      data: "Worker not found",
    };
  } else {
    worker.reset().then((data) => {
      event.returnValue = { error: !data.status, data: data.message };
    });
  }
});

ipcMain.on(STOP_WORKER, (event, args: [string]) => {
  const [namespace] = args;
  Logger.info(`[${namespace}] Stop worker`);
  const worker = scheduledWorkers.find(
    (worker) =>
      worker instanceof ScheduledWorker && worker.getNamespace() === namespace
  ) as ScheduledWorker | undefined;
  if (!worker) {
    event.returnValue = {
      error: true,
      data: "Worker not found",
    };
  } else {
    worker.manualStop().then((data) => {
      event.returnValue = { error: !data.status, data: data.message };
    });
  }
});

ipcMain.handle(
  "get-last-lines",
  async (_event: IpcMainInvokeEvent, filePath: string, numLines: number) => {
    try {
      const data = await fs.promises.readFile(filePath, "utf-8");
      const allLines = data.split("\n");
      const totalLines = allLines.length;
      const lines = allLines.slice(-numLines);
      const startLineNumber = totalLines - lines.length;

      const lineObjects = lines.map((content, index) => ({
        id: startLineNumber + index, // Line number
        content,
      }));

      return { lines: lineObjects };
    } catch (error) {
      console.error(error);
      return { lines: [] };
    }
  }
);

ipcMain.on("start-tail", async (event: IpcMainEvent, filePath: string) => {
  if (tails[filePath]) return; // Prevent duplicate tails

  let lineNumber = 0;
  try {
    const data = await fs.promises.readFile(filePath, "utf-8");
    lineNumber = data.split("\n").length;
  } catch (error) {
    console.error("Error reading file to get line number:", error);
    lineNumber = 0;
  }

  const tail = new Tail(filePath);

  tail.on("line", (data: string) => {
    event.sender.send("tail-line", filePath, {
      id: lineNumber++,
      content: data,
    });
  });

  tail.on("error", (error: Error) => {
    console.error("Tail error:", error);
  });

  tails[filePath] = tail;
});

ipcMain.on("stop-tail", (_event: IpcMainEvent, filePath: string) => {
  if (tails[filePath]) {
    tails[filePath].unwatch();
    delete tails[filePath];
  }
});

ipcMain.handle(
  "get-previous-lines",
  async (
    _event: IpcMainInvokeEvent,
    filePath: string,
    startLine: number,
    numLines: number
  ) => {
    try {
      const data = await fs.promises.readFile(filePath, "utf-8");
      const allLines = data.split("\n");

      const endLine = startLine + numLines;
      const lines = allLines.slice(startLine, endLine);

      const lineObjects = lines.map((content, index) => ({
        id: startLine + index, // Line number
        content,
      }));

      return { lines: lineObjects };
    } catch (error) {
      console.error(error);
      return { lines: [] };
    }
  }
);
