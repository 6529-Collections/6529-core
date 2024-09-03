import Database from "better-sqlite3";
import databasePath from "./utils/databasePath";
import { SEED_WALLET_TABLE } from "../constants";
import { ISeedWallet } from "../shared/types";

const ethers = require("ethers");

const db = new Database(databasePath);

export function addSeedWallet(name: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const wallet = ethers.Wallet.createRandom();
      const prepare = db.prepare(
        `INSERT INTO ${SEED_WALLET_TABLE} (name, address, mnemonic, private_key) VALUES (?, ?, ?, ?)`
      );
      prepare.run(
        name,
        wallet.address,
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

export function getSeedWallet(name: string) {
  return new Promise((resolve, reject) => {
    try {
      const results = db
        .prepare(`SELECT * FROM ${SEED_WALLET_TABLE} WHERE name = ?`)
        .get(name) as {
        address: string;
      } as ISeedWallet;
      resolve(results);
    } catch (e: any) {
      console.error("ERROR IN getSeedWallet", e);
      reject(new Error(e));
    }
  });
}

export function deleteSeedWallet(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(`DELETE FROM ${SEED_WALLET_TABLE} WHERE name = ?`).run(name);
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
        name TEXT PRIMARY KEY COLLATE NOCASE,
        address TEXT NOT NULL,
        mnemonic TEXT NOT NULL,
        private_key TEXT NOT NULL
    )`);
}
