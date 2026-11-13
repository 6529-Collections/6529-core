import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type { ElectronWalletPasswords } from "../shared/wallet-passwords";
import type { DesktopProfileState } from "../shared/desktop-profile-state";
import type { DesktopValidatorStatus } from "../shared/desktop-validator";
import {
  LogLine,
  ScheduledWorkerStatus,
  SeedWalletRequest,
} from "../shared/types";
import type {
  ElectronSeedConnector as SeedConnectorBridge,
  NotificationNavigationContext,
  NotificationNavigatePayload,
  SanitizedProfilePicture,
} from "../shared/preload-types";

import type {
  IpfsStatus,
  LocalIpfsPreferencesSnapshot,
} from "../shared/ipfs-status";

// The channels the renderer reaches through the generic send, sendSync and
// invoke calls (the names in electron-constants.ts that renderer/electron.ts
// uses). Every other channel has its own named bridge below, so a page can
// never call an arbitrary main-process handler. The generic `on` is held to
// the same list: the renderer subscribes only through the named bridges.
// Listed as literals because a sandboxed preload cannot require other files.
// preload-channels.test.ts keeps this list in step with the renderer.
const GENERIC_IPC_CHANNELS: ReadonlySet<string> = new Set([
  "addSeedWallet",
  "importSeedWallet",
  "deleteSeedWallet",
  "getSeedWallets",
  "getSeedWallet",
  "addRpcProvider",
  "setRpcProviderActive",
  "deactivateRpcProvider",
  "deleteRpcProvider",
  "manualStartWorker",
  "fullRefreshWorker",
  "resetTransactionsToBlock",
  "recalculateTransactionsOwners",
  "reconcileTransactions",
  "resetWorker",
  "stopWorker",
]);

function allowedChannel(channel: string): string {
  if (!GENERIC_IPC_CHANNELS.has(channel)) {
    throw new Error(`IPC channel "${channel}" is not available to the page`);
  }
  return channel;
}

const localIpfsFrameFailureListeners = new Set<(url: string) => void>();
ipcRenderer.on("local-ipfs-frame-failed", (_event, url: string) => {
  for (const listener of localIpfsFrameFailureListeners) listener(url);
});

const walletPasswords: ElectronWalletPasswords = {
  isAvailable: () => ipcRenderer.invoke("wallet-passwords:is-available"),
  generate: () => ipcRenderer.invoke("wallet-passwords:generate"),
  hasSavedPassword: (address) => ipcRenderer.invoke("wallet-passwords:has-saved", address),
  unlock: (address, password) => ipcRenderer.invoke("wallet-passwords:unlock", address, password),
  lock: () => ipcRenderer.invoke("wallet-passwords:lock"),
  recover: (address, field, password) =>
    ipcRenderer.invoke("wallet-passwords:recover", address, field, password),
  offerSave: (address, password) =>
    ipcRenderer.invoke("wallet-passwords:offer-save", address, password),
  forget: (address) => ipcRenderer.invoke("wallet-passwords:forget", address),
};
contextBridge.exposeInMainWorld("walletPasswords", walletPasswords);

export const api = {
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(allowedChannel(channel), (event: IpcRendererEvent, args: any) =>
      callback(event, args)
    );
  },
  send: (channel: string, ...args: any[]): void => {
    ipcRenderer.send(allowedChannel(channel), args);
  },
  sendSync: (channel: string, ...args: any[]): any => {
    return ipcRenderer.sendSync(allowedChannel(channel), args);
  },
  invoke: (channel: string, ...args: any[]): Promise<any> => {
    return ipcRenderer.invoke(allowedChannel(channel), args);
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
  showFile: (fileName: string) => {
    ipcRenderer.send("show-file", fileName);
  },
  openLogs: (name: string, logFile: string) => {
    ipcRenderer.send("open-logs", name, logFile);
  },
  extractCrashReport: (fileName: string) => {
    ipcRenderer.send("extract-crash-report", fileName);
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
  getIpfsInfo: () => ipcRenderer.invoke("get-ipfs-info"),
  getDesktopValidatorVisible: (): Promise<boolean> =>
    ipcRenderer.invoke("desktop-validator:get-visible"),
  setDesktopValidatorVisible: (visible: boolean): Promise<boolean> =>
    ipcRenderer.invoke("desktop-validator:set-visible", visible),
  getDesktopValidatorStatus: (): Promise<DesktopValidatorStatus> =>
    ipcRenderer.invoke("desktop-validator:status"),
  isDesktopValidatorInstalled: (): Promise<boolean> =>
    ipcRenderer.invoke("desktop-validator:is-installed"),
  openDesktopValidator: (): Promise<void> =>
    ipcRenderer.invoke("desktop-validator:open"),
  sanitizeProfilePicture: (bytes: ArrayBuffer): Promise<SanitizedProfilePicture> =>
    ipcRenderer.invoke("sanitize-profile-picture", bytes),
  getLocalIpfsPreferences: (): Promise<LocalIpfsPreferencesSnapshot> =>
    ipcRenderer.invoke("get-local-ipfs-preferences"),
  setLocalIpfsEnabled: (enabled: boolean): Promise<LocalIpfsPreferencesSnapshot> =>
    ipcRenderer.invoke("set-local-ipfs-enabled", enabled),
  restartForLocalIpfs: (): Promise<void> =>
    ipcRenderer.invoke("restart-for-local-ipfs"),
  onIpfsStatusChange: (callback: (status: IpfsStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: IpfsStatus) =>
      callback(status);
    ipcRenderer.on("ipfs-status-change", listener);
    return () => {
      ipcRenderer.removeListener("ipfs-status-change", listener);
    };
  },
  onLocalIpfsFrameFailed: (callback: (url: string) => void) => {
    localIpfsFrameFailureListeners.add(callback);
    return () => {
      localIpfsFrameFailureListeners.delete(callback);
    };
  },
  getMainWorker: () => ipcRenderer.invoke("get-main-worker"),
  getScheduledWorkers: () => ipcRenderer.invoke("get-scheduled-workers"),
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
  navigationReady: () => ipcRenderer.invoke("navigation-ready"),
  offNavigate: (callback: any) =>
    ipcRenderer.removeListener("navigate", callback),
  onNotificationNavigate: (
    callback: (event: any, payload: NotificationNavigatePayload) => void
  ) => ipcRenderer.on("notification-navigate", callback),
  offNotificationNavigate: (
    callback: (event: any, payload: NotificationNavigatePayload) => void
  ) => ipcRenderer.removeListener("notification-navigate", callback),
  onWorkerUpdate: (
    callback: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => void
  ) =>
    ipcRenderer.on(
      "worker-update",
      (_event, namespace, status, message, action, statusPercentage) =>
        callback(namespace, status, message, action, statusPercentage)
    ),
  offWorkerUpdate: (
    callback: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => void
  ) =>
    ipcRenderer.removeListener(
      "worker-update",
      (_event, namespace, status, message, action, statusPercentage) =>
        callback(namespace, status, message, action, statusPercentage)
    ),
  getLastLines: (
    filePath: string,
    numLines: number
  ): Promise<{ lines: LogLine[] }> =>
    ipcRenderer.invoke("get-last-lines", filePath, numLines),

  startTail: (filePath: string): void =>
    ipcRenderer.send("start-tail", filePath),

  stopTail: (filePath: string): void => ipcRenderer.send("stop-tail", filePath),

  onTailLine: (callback: (filePath: string, line: LogLine) => void): void => {
    ipcRenderer.on(
      "tail-line",
      (_event: IpcRendererEvent, filePath: string, line: LogLine) =>
        callback(filePath, line)
    );
  },

  getPreviousLines: (
    filePath: string,
    startLine: number,
    numLines: number
  ): Promise<{ lines: LogLine[] }> =>
    ipcRenderer.invoke("get-previous-lines", filePath, startLine, numLines),

  onOpenSearch: (callback: any) => ipcRenderer.on("open-search", callback),
  offOpenSearch: (callback: any) =>
    ipcRenderer.removeListener("open-search", callback),
};

contextBridge.exposeInMainWorld("api", api);

export const store = {
  get: (key: string) => ipcRenderer.invoke("store:get", key),
  set: (key: string, value: any) => ipcRenderer.invoke("store:set", key, value),
  remove: (key: string) => ipcRenderer.invoke("store:remove", key),
};

contextBridge.exposeInMainWorld("store", store);

export const nativeAuth = {
  profilesReady: (): Promise<void> => ipcRenderer.invoke("native-auth:profiles-ready"),
  restartProfileRestore: (): Promise<void> =>
    ipcRenderer.invoke("native-auth:restart-profile-restore"),
  restoreProfiles: (current: DesktopProfileState): Promise<DesktopProfileState> =>
    ipcRenderer.invoke("native-auth:restore-profiles", current),
  saveProfiles: (state: DesktopProfileState): Promise<void> =>
    ipcRenderer.invoke("native-auth:save-profiles", state),
  isAvailable: () => ipcRenderer.invoke("native-auth:is-available"),
  removeRefreshToken: (request: {
    readonly client_type?: "native" | "desktop";
    readonly client_address: string;
  }) => ipcRenderer.invoke("native-auth:remove-refresh-token", request),
  sessionLogin: (request: {
    readonly client_type?: "native" | "desktop";
    readonly server_signature: string;
    readonly client_signature: string;
    readonly client_address: string;
    readonly role?: string | null;
  }) => ipcRenderer.invoke("native-auth:session-login", request),
  sessionRefresh: (request: {
    readonly client_type?: "native" | "desktop";
    readonly client_address: string;
  }) => ipcRenderer.invoke("native-auth:session-refresh", request),
  createConnectionShare: (request: {
    readonly encrypted_device_setup?: string;
    readonly access_token?: string | null;
    readonly target_client_type?: "native" | "desktop";
    readonly client_type?: "native" | "desktop";
    readonly client_address?: string;
  }) => ipcRenderer.invoke("native-auth:connection-share", request),
  createLegacyDesktopConnectionShare: (request: {
    readonly access_token?: string | null;
    readonly client_type?: "native" | "desktop";
    readonly client_address?: string;
  }) =>
    ipcRenderer.invoke("native-auth:connection-share:legacy-desktop", request),
  redeemConnectionShare: (request: {
    readonly access_token?: string | null;
    readonly connection_share_code: string;
    readonly target_client_type?: "native" | "desktop";
  }) => ipcRenderer.invoke("native-auth:connection-share:redeem", request),
  sessionLogout: (request: {
    readonly access_token?: string | null;
    readonly client_type?: "native" | "desktop";
    readonly client_address: string;
    readonly all_sessions: boolean;
  }) => ipcRenderer.invoke("native-auth:session-logout", request),
};

contextBridge.exposeInMainWorld("nativeAuth", nativeAuth);

export const notifications = {
  showNotification: (
    id: number,
    pfp: string,
    title: string,
    body: string,
    redirectPath: string,
    navigationContext?: NotificationNavigationContext
  ) =>
    ipcRenderer.send(
      "notifications:show",
      id,
      pfp,
      title,
      body,
      redirectPath,
      navigationContext
    ),
  setBadge: (count: number) =>
    ipcRenderer.send("notifications:set-badge", count),
};

contextBridge.exposeInMainWorld("notifications", notifications);

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

function subscribeSeedConnector<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

export const seedConnector: SeedConnectorBridge = {
  initRequest: (request: SeedWalletRequest) => ipcRenderer.invoke("seed-connector-init-request", request),
  onInitRequest: (callback) => subscribeSeedConnector("seed-connector-init-request", callback),
  onSettled: (callback) => subscribeSeedConnector("seed-connector-settled", callback),
  onWalletInvalidated: (callback) => subscribeSeedConnector("seed-wallet-lock-changed", callback),
  showToast: (toast) => {
    ipcRenderer.send("seed-connector-show-toast", toast);
  },
  onShowToast: (callback) => subscribeSeedConnector("seed-connector-show-toast", callback),
  confirm: (requestId) => ipcRenderer.send("seed-connector-confirm", requestId),
  reject: (requestId) => ipcRenderer.send("seed-connector-reject", requestId),
  disconnect: () => ipcRenderer.invoke("seed-connector-disconnect"),
  onDisconnect: (callback) => subscribeSeedConnector("seed-connector-disconnect", callback),
};

contextBridge.exposeInMainWorld("seedConnector", seedConnector);

export const localDb = {
  getTdhInfo: () => ipcRenderer.invoke("get-tdh-info"),
  getTdhInfoForKey: (key: string) =>
    ipcRenderer.invoke("get-tdh-info-for-key", key),
  getTransactions: (
    startDate?: number,
    endDate?: number,
    page?: number,
    limit?: number,
    contractAddress?: string,
    transactionHash?: string,
    sortDirection?: string
  ) =>
    ipcRenderer.invoke("get-transactions", {
      startDate,
      endDate,
      page,
      limit,
      contractAddress,
      transactionHash,
      sortDirection,
    }),
  getNfts: (
    page?: number,
    limit?: number,
    contractAddress?: string,
    search?: string,
    season?: number,
    sortDirection?: string
  ) =>
    ipcRenderer.invoke("get-nfts", {
      page,
      limit,
      contractAddress,
      search,
      season,
      sortDirection,
    }),
};

contextBridge.exposeInMainWorld("localDb", localDb);

export type ElectronAPI = typeof api;
export type ElectronNativeAuth = typeof nativeAuth;
export type ElectronStore = typeof store;
export type ElectronUpdater = typeof updater;
export type ElectronSeedConnector = typeof seedConnector;
export type ElectronNotifications = typeof notifications;
export type ElectronLocalDB = typeof localDb;
