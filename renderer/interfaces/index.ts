import { api } from "../../electron-src/preload";

declare global {
  interface Global {
    electron: typeof api;
  }
}
