export {};
import {
  ElectronAPI,
  ElectronSeedConnector,
  ElectronStore,
  ElectronUpdater,
} from "../electron-src/preload";

declare global {
  interface Window {
    api: ElectronAPI;
    updater: ElectronUpdater;
    store: ElectronStore;
    seedConnector: ElectronSeedConnector;
  }
}
