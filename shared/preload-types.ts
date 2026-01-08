import { LogLine, ScheduledWorkerStatus, SeedWalletRequest } from "./types";

export interface ElectronAPI {
  on: (channel: string, callback: Function) => void;
  send: (channel: string, ...args: any[]) => void;
  sendSync: (channel: string, ...args: any[]) => any;
  openExternal: (url: string) => void;
  openExternalChrome: (url: string) => void;
  openExternalFirefox: (url: string) => void;
  openExternalBrave: (url: string) => void;
  showFile: (fileName: string) => void;
  openLogs: (name: string, logFile: string) => void;
  extractCrashReport: (fileName: string) => void;
  onAppClose: (callback: any) => void;
  runBackground: () => void;
  quit: () => void;
  goBack: () => void;
  goForward: () => void;
  getNavigationState: () => Promise<any>;
  onNavigationStateChange: (callback: any) => void;
  offNavigationStateChange: (callback: any) => void;
  onSeedWalletsChange: (callback: any) => void;
  offSeedWalletsChange: (callback: any) => void;
  getInfo: () => Promise<any>;
  getIpfsInfo: () => Promise<any>;
  getMainWorker: () => Promise<any>;
  getScheduledWorkers: () => Promise<any>;
  getCrashReports: () => Promise<any>;
  onWalletConnection: (connectionData: any) => void;
  handleWalletResponse: (response: any) => void;
  onNavigate: (url: any) => void;
  offNavigate: (callback: any) => void;
  onWorkerUpdate: (
    callback: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => void
  ) => void;
  offWorkerUpdate: (
    callback: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => void
  ) => void;
  getLastLines: (
    filePath: string,
    numLines: number
  ) => Promise<{ lines: LogLine[] }>;
  startTail: (filePath: string) => void;
  stopTail: (filePath: string) => void;
  onTailLine: (callback: (filePath: string, line: LogLine) => void) => void;
  getPreviousLines: (
    filePath: string,
    startLine: number,
    numLines: number
  ) => Promise<{ lines: LogLine[] }>;
  onOpenSearch: (callback: any) => void;
  offOpenSearch: (callback: any) => void;
}

export interface ElectronStore {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export interface ElectronNotifications {
  showNotification: (
    id: number,
    pfp: string,
    title: string,
    body: string,
    redirectPath: string
  ) => void;
  setBadge: (count: number) => void;
}

export interface ElectronUpdater {
  checkUpdates: () => void;
  onUpdateAvailable: (data: any) => void;
  offUpdateAvailable: (data: any) => void;
  onUpdateNotAvailable: (data: any) => void;
  offUpdateNotAvailable: (data: any) => void;
  onUpdateError: (error: any) => void;
  offUpdateError: (error: any) => void;
  onUpdateProgress: (progress: any) => void;
  offUpdateProgress: (progress: any) => void;
  onUpdateDownloaded: (data: any) => void;
  offUpdateDownloaded: (data: any) => void;
  downloadUpdate: () => void;
  installUpdate: () => void;
}

export interface ElectronSeedConnector {
  initRequest: (request: SeedWalletRequest) => void;
  onInitRequest: (callback: any) => void;
  offInitRequest: (callback: any) => void;
  showToast: (toast: { type: string; message: string }) => void;
  onShowToast: (callback: any) => void;
  offShowToast: (callback: any) => void;
  confirm: (request: SeedWalletRequest) => void;
  onConfirm: (callback: any) => void;
  offConfirm: (callback: any) => void;
  reject: (request: SeedWalletRequest) => void;
  onReject: (callback: any) => void;
  offReject: (callback: any) => void;
  disconnect: () => void;
  onDisconnect: (callback: any) => void;
  offDisconnect: (callback: any) => void;
}

export interface ElectronLocalDB {
  getTdhInfo: () => Promise<any>;
  getTdhInfoForKey: (key: string) => Promise<any>;
  getTransactions: (
    startDate?: number,
    endDate?: number,
    page?: number,
    limit?: number,
    contractAddress?: string
  ) => Promise<any>;
}
