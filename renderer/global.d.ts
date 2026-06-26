export {};
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
    api: ElectronAPI;
    nativeAuth: ElectronNativeAuth;
    updater: ElectronUpdater;
    store: ElectronStore;
    seedConnector: ElectronSeedConnector;
    notifications: ElectronNotifications;
    localDb: ElectronLocalDB;
  }
}
