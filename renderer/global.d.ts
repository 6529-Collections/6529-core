export {};
import {
  ElectronAPI,
  ElectronSeedConnector,
  ElectronStore,
  ElectronUpdater,
  ElectronNotifications,
} from "../electron-src/preload";

declare global {
  interface Window {
    api: ElectronAPI;
    updater: ElectronUpdater;
    store: ElectronStore;
    seedConnector: ElectronSeedConnector;
    notifications: ElectronNotifications;
  }
}
