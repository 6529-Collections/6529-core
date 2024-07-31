import Database from "better-sqlite3";
import databasePath from "./utils/databasePath";
import { CUSTOM_WALLET_TABLE } from "../constants";
import { ICustomWallet } from "../shared/types";

import ethers from "ethers";

const db = new Database(databasePath);

export function addCustomWallet(): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const wallet = ethers.Wallet.createRandom();
      const prepare = db.prepare(
        `INSERT OR REPLACE INTO ${CUSTOM_WALLET_TABLE} (id, address, mnemonic, private_key) VALUES (1, ?, ?, ?)`
      );
      prepare.run(wallet.address, wallet.mnemonic?.phrase, wallet.privateKey);
      resolve(wallet.address);
    } catch (e: any) {
      console.error("ERROR IN addCustomWallet", e);
      reject(new Error(e));
    }
  });
}

export function getCustomWallet(): Promise<ICustomWallet | undefined> {
  const result = db.prepare(`SELECT * FROM ${CUSTOM_WALLET_TABLE}`).get() as {
    address: string;
  } as ICustomWallet;

  return Promise.resolve(result);
}

export function deleteCustomWallet(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(`DELETE FROM ${CUSTOM_WALLET_TABLE} WHERE id = 1`).run();
      resolve();
    } catch (e: any) {
      console.error("ERROR IN deleteCustomWallet", e);
      reject(new Error(e));
    }
  });
}

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${CUSTOM_WALLET_TABLE} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      address TEXT NOT NULL,
      mnemonic TEXT NOT NULL,
      private_key TEXT NOT NULL
    )`);
}
