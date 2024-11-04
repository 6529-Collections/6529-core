import databasePath from "../utils/databasePath";
import { MNEMONIC_NA } from "../../constants";
import { encryptData } from "../../shared/encrypt";

import { ethers } from "ethers";
import { SeedWallet } from "./entities/ISeedWallet";
import { DataSource, In, Not } from "typeorm";
import Logger from "electron-log";
import { BetterSqlite3ConnectionOptions } from "typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions";
import { RPCProvider } from "./entities/IRpcProvider";
import { ConsolidatedTDH, TDHMerkleRoot } from "./entities/ITDH";

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

export async function getRpcProviders(): Promise<RPCProvider[]> {
  return await AppDataSource.getRepository(RPCProvider).find({
    order: {
      deletable: "ASC",
      id: "ASC",
    },
  });
}

export async function addRpcProvider(
  name: string,
  url: string,
  deletable: boolean = true
): Promise<number> {
  const rpcProvider = new RPCProvider();
  rpcProvider.name = name;
  rpcProvider.url = url;
  rpcProvider.deletable = deletable;
  const result = await AppDataSource.manager.save(rpcProvider);
  return result.id;
}

export async function setRpcProviderActive(id: number): Promise<void> {
  await AppDataSource.transaction(async (transactionalEntityManager) => {
    await transactionalEntityManager.update(
      RPCProvider,
      { id: Not(id) },
      { active: false }
    );
    await transactionalEntityManager.update(
      RPCProvider,
      { id },
      { active: true }
    );
  });
}

export async function deactivateRpcProvider(id: number): Promise<void> {
  await AppDataSource.manager.update(RPCProvider, { id }, { active: false });
}

export async function deleteRpcProvider(id: number): Promise<void> {
  const repo = AppDataSource.getRepository(RPCProvider);
  const provider = await repo.findOne({ where: { id } });
  if (!provider) {
    throw new Error("RPC provider not found");
  }
  if (provider.active) {
    throw new Error("Cannot delete active RPC provider");
  }
  if (!provider.deletable) {
    throw new Error("This RPC provider is not deletable");
  }
  await repo.remove(provider);
}

export const initDb = async () => {
  try {
    AppDataSource = new DataSource({
      ...baseDataSourceParams,
      entities: [SeedWallet, RPCProvider, TDHMerkleRoot, ConsolidatedTDH],
      synchronize: true,
    });
    await AppDataSource.initialize();
    Logger.info("Database connection established");
    await populateDefaults();
  } catch (error) {
    Logger.error("Error during Data Source initialization:", error);
  }
};

async function populateDefaults() {
  await populateDefaultRpcProviders();
}

async function populateDefaultRpcProviders() {
  const defaultProviders = [
    { name: "6529 Node", url: "https://api.seize.io/rpc" },
    { name: "Ankr", url: "https://rpc.ankr.com/eth" },
    { name: "Public Node", url: "https://ethereum.publicnode.com" },
    { name: "LlamaNodes", url: "https://eth.llamarpc.com" },
  ];
  await AppDataSource.transaction(async (transactionalEntityManager) => {
    const providers = await transactionalEntityManager.find(RPCProvider);
    for (const provider of defaultProviders) {
      const existingProvider = providers.find(
        (p) => p.name === provider.name || p.url === provider.url
      );
      if (!existingProvider) {
        await transactionalEntityManager.insert(RPCProvider, {
          name: provider.name,
          url: provider.url,
          deletable: false,
        });
      } else if (
        existingProvider.deletable ||
        provider.name !== existingProvider.name ||
        provider.url !== existingProvider.url
      ) {
        await transactionalEntityManager.update(
          RPCProvider,
          { id: existingProvider.id },
          { deletable: false, name: provider.name, url: provider.url }
        );
      }
    }
    const defaultProviderNames = defaultProviders.map(
      (provider) => provider.name
    );
    await transactionalEntityManager.update(
      RPCProvider,
      { name: Not(In(defaultProviderNames)) },
      { deletable: true }
    );
  });
}

export const getDb = () => AppDataSource;
export const getBaseDbParams = () => baseDataSourceParams;
