export {};
import type { ElectronWalletPasswords } from "../shared/wallet-passwords";
import {
  ElectronAPI,
  ElectronNativeAuth,
  ElectronSeedConnector,
  ElectronStore,
  ElectronUpdater,
  ElectronNotifications,
  ElectronLocalDB,
} from "../shared/preload-types";

declare global {
  interface Window {
    walletPasswords?: ElectronWalletPasswords;
    api: ElectronAPI;
    nativeAuth?: ElectronNativeAuth;
    updater: ElectronUpdater;
    store: ElectronStore;
    seedConnector: ElectronSeedConnector;
    notifications: ElectronNotifications;
    localDb: ElectronLocalDB;
  }
}
