import Database from "better-sqlite3";
import databasePath from "./utils/databasePath";
import { MNEMONIC_NA, SEED_WALLET_TABLE } from "../constants";
import { ISeedWallet } from "../shared/types";
import { encryptData } from "../shared/encrypt";

import { ethers } from "ethersv6";

const db = new Database(databasePath);

export function addSeedWallet(
  name: string,
  pass: string
): Promise<string | undefined> {
  return new Promise(async (resolve, reject) => {
    try {
      const wallet = ethers.Wallet.createRandom();
      const encryptedAddress = await encryptData(
        wallet.address,
        wallet.address,
        pass
      );
      const encryptedMnemonic = await encryptData(
        wallet.address,
        wallet.mnemonic!.phrase,
        pass
      );
      const encryptedPrivateKey = await encryptData(
        wallet.address,
        wallet.privateKey,
        pass
      );
      const prepare = db.prepare(
        `INSERT INTO ${SEED_WALLET_TABLE} (address, address_hashed, name, mnemonic, private_key) VALUES (?, ?, ?, ?, ?)`
      );
      prepare.run(
        wallet.address,
        encryptedAddress,
        name,
        encryptedMnemonic,
        encryptedPrivateKey
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
  pass: string,
  address: string,
  mnemonic: string,
  privateKey: string
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const encryptedAddress = await encryptData(address, address, pass);
      const encryptedMnemonic =
        mnemonic === MNEMONIC_NA
          ? mnemonic
          : await encryptData(address, mnemonic, pass);
      const encryptedPrivateKey = await encryptData(address, privateKey, pass);
      const prepare = db.prepare(
        `INSERT INTO ${SEED_WALLET_TABLE} (address, address_hashed, name, mnemonic, private_key, imported) VALUES (?, ?, ?, ?, ?, true)`
      );
      prepare.run(
        address,
        encryptedAddress,
        name,
        encryptedMnemonic,
        encryptedPrivateKey
      );
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
        address_hashed TEXT NOT NULL CHECK (address_hashed <> ''),
        name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (name <> ''),
        mnemonic TEXT NOT NULL CHECK (mnemonic <> ''),
        private_key TEXT NOT NULL CHECK (private_key <> ''),
        imported BOOLEAN NOT NULL DEFAULT 0
    )`);
}
