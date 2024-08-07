export {};
import { ElectronAPI, ElectronStore } from "../electron-src/preload";

declare global {
  interface Window {
    api: ElectronAPI;
    store: ElectronStore;
  }
}
