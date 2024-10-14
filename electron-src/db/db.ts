import databasePath from "../utils/databasePath";
import { MNEMONIC_NA } from "../../constants";
import { encryptData } from "../../shared/encrypt";

import { ethers } from "ethers";
import { SeedWallet } from "./entities/ISeedWallet";
import { DataSource } from "typeorm";
import Logger from "electron-log";
import { BetterSqlite3ConnectionOptions } from "typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions";

let AppDataSource: DataSource;

const baseDataSourceParams: BetterSqlite3ConnectionOptions = {
  type: "better-sqlite3",
  database: databasePath,
};

export async function addSeedWallet(
  name: string,
  pass: string
): Promise<string | undefined> {
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

  const seedWallet = new SeedWallet();
  seedWallet.address = wallet.address;
  seedWallet.address_hashed = encryptedAddress;
  seedWallet.name = name;
  seedWallet.mnemonic = encryptedMnemonic;
  seedWallet.private_key = encryptedPrivateKey;

  await AppDataSource.manager.save(seedWallet);
  return wallet.address;
}

export async function importSeedWallet(
  name: string,
  pass: string,
  address: string,
  mnemonic: string,
  privateKey: string
): Promise<void> {
  const encryptedAddress = await encryptData(address, address, pass);
  const encryptedMnemonic =
    mnemonic === MNEMONIC_NA
      ? mnemonic
      : await encryptData(address, mnemonic, pass);
  const encryptedPrivateKey = await encryptData(address, privateKey, pass);

  const seedWallet = new SeedWallet();
  seedWallet.address = address;
  seedWallet.address_hashed = encryptedAddress;
  seedWallet.name = name;
  seedWallet.mnemonic = encryptedMnemonic;
  seedWallet.private_key = encryptedPrivateKey;
  seedWallet.imported = true;

  await AppDataSource.manager.save(seedWallet);
}

export async function getSeedWallets(): Promise<SeedWallet[]> {
  return await AppDataSource.manager.find(SeedWallet);
}

export async function getSeedWallet(
  address: string
): Promise<SeedWallet | null> {
  return await AppDataSource.manager.findOne(SeedWallet, {
    where: { address },
  });
}

export async function deleteSeedWallet(address: string): Promise<void> {
  await AppDataSource.manager.delete(SeedWallet, { address });
}

export const initDb = async () => {
  try {
    AppDataSource = new DataSource({
      ...baseDataSourceParams,
      entities: [SeedWallet],
      synchronize: true,
    });
    await AppDataSource.initialize();
    Logger.info("Database connection established");
  } catch (error) {
    Logger.error("Error during Data Source initialization:", error);
  }
};

export const getDb = () => AppDataSource;
export const getBaseDbParams = () => baseDataSourceParams;
