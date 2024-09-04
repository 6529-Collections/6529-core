import Database from "better-sqlite3";
import databasePath from "./utils/databasePath";
import { SEED_WALLET_TABLE } from "../constants";
import { ISeedWallet } from "../shared/types";

import { ethers } from "ethers";

const db = new Database(databasePath);

export function addSeedWallet(name: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const wallet = ethers.Wallet.createRandom();
      const prepare = db.prepare(
        `INSERT INTO ${SEED_WALLET_TABLE} (address, name, mnemonic, private_key) VALUES (?, ?, ?, ?)`
      );
      prepare.run(
        wallet.address,
        name,
        wallet.mnemonic?.phrase,
        wallet.privateKey
      );
      resolve(wallet.address);
    } catch (e: any) {
      console.error("ERROR IN addSeedWallet", e);
      reject(new Error(e));
    }
  });
}

export function importSeedWallet(
  name: string,
  address: string,
  mnemonic: string,
  privateKey: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const prepare = db.prepare(
        `INSERT INTO ${SEED_WALLET_TABLE} (address, name, mnemonic, private_key, imported) VALUES (?, ?, ?, ?, true)`
      );
      prepare.run(address, name, mnemonic, privateKey);
      resolve();
    } catch (e: any) {
      console.error("ERROR IN importSeedWallet", e);
      reject(new Error(e));
    }
  });
}

export function getSeedWallets(): Promise<ISeedWallet[] | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const results = db
        .prepare(`SELECT * FROM ${SEED_WALLET_TABLE}`)
        .all() as ISeedWallet[];
      resolve(results ?? []);
    } catch (e: any) {
      console.error("ERROR IN getSeedWallets", e);
      reject(new Error(e));
    }
  });
}

export function getSeedWallet(address: string) {
  return new Promise((resolve, reject) => {
    try {
      const results = db
        .prepare(`SELECT * FROM ${SEED_WALLET_TABLE} WHERE address = ?`)
        .get(address) as {
        address: string;
      } as ISeedWallet;
      resolve(results);
    } catch (e: any) {
      console.error("ERROR IN getSeedWallet", e);
      reject(new Error(e));
    }
  });
}

export function deleteSeedWallet(address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(`DELETE FROM ${SEED_WALLET_TABLE} WHERE address = ?`).run(
        address
      );
      resolve();
    } catch (e: any) {
      console.error("ERROR IN deleteSeedWallet", e);
      reject(new Error(e));
    }
  });
}

export function initDb(): void {
  db.exec(`
      CREATE TABLE IF NOT EXISTS ${SEED_WALLET_TABLE} (
        address TEXT PRIMARY KEY COLLATE NOCASE CHECK (address <> ''),
        name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (name <> ''),
        mnemonic TEXT NOT NULL CHECK (mnemonic <> ''),
        private_key TEXT NOT NULL CHECK (private_key <> ''),
        imported BOOLEAN NOT NULL DEFAULT 0
    )`);
}
