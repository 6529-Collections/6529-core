import { app } from "electron";
import path from "node:path";
import fs from "fs";
import Logger from "electron-log";

interface StoreData {
  [key: string]: any;
}

let store: StoreData = {};
const storePath = path.join(app.getPath("userData"), "store.json");

export function initStore() {
  try {
    if (fs.existsSync(storePath)) {
      Logger.info("Store Loaded from file");
      const data = fs.readFileSync(storePath, "utf8");
      store = JSON.parse(data);
    } else {
      Logger.info("Store file not found, initializing store");
      store = {};
      saveStore();
    }
    Logger.info("Store initialized successfully");
  } catch (error) {
    Logger.error("Error initializing store:", error);
    store = {};
  }
}

export const saveStore = () => {
  fs.writeFileSync(storePath, JSON.stringify(store));
};

export const getValue = (key: string) => store[key];

export const setValue = (key: string, value: any) => {
  store[key] = value;
  saveStore();
};

export const removeValue = (key: string) => {
  delete store[key];
  saveStore();
};
