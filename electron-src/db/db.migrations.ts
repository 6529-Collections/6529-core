import { DataSource, MoreThan, Not } from "typeorm";
import { CoreMigration } from "./entities/ICoreMigration";
import Logger from "electron-log";
import { Transaction } from "./entities/ITransaction";
import { NULL_ADDRESS } from "../../electron-constants";
import { NEXTGEN_CONTRACT } from "../../shared/abis/nextgen";
import { findTransactionValues } from "../scheduled-tasks/workers/transactions-worker/transaction-values";
import { ethers, JsonRpcProvider } from "ethers";
import { NFT } from "./entities/INFT";
import {
  Contract,
  ContractType,
  getEditionSizes,
  getTokenUri,
  retrieveNftFromURI,
} from "../scheduled-tasks/workers/nft-worker/nft-worker";
import { MEMES_ABI, MEMES_CONTRACT } from "../../shared/abis/memes";
import { areEqualAddresses } from "../../shared/helpers";

const loggerName = "[DB MIGRATIONS]";
const EDITION_SIZE_FLOOR_FULL_REFRESH_THRESHOLD = 300;

export async function runCoreMigrations(dataSource: DataSource) {
  await runBlurRoyaltiesMigration(dataSource);
  await runNftEditionSizeFloorMigration(dataSource);
}

async function hasMigrationRun(
  dataSource: DataSource,
  migrationName: string
) {
  const existing = await dataSource.getRepository(CoreMigration).findOne({
    where: { migration_name: migrationName },
  });

  if (existing) {
    Logger.info(loggerName, `Migration ${migrationName} already applied.`);
    return true;
  }

  return false;
}

async function runBlurRoyaltiesMigration(dataSource: DataSource) {
  const migrationName = "blurRoyalties";

  if (await hasMigrationRun(dataSource, migrationName)) {
    return;
  }

  Logger.info(loggerName, `Running migration ${migrationName}...`);

  const repo = dataSource.getRepository(Transaction);
  const transactions = await repo.find({
    where: {
      contract: NEXTGEN_CONTRACT,
      from_address: Not(NULL_ADDRESS),
      value: MoreThan(0),
    },
  });

  Logger.info(loggerName, `Found ${transactions.length} transactions`);

  const batchSize = 100;
  const transactionsWithValues: Transaction[] = [];
  const totalBatches = Math.ceil(transactions.length / batchSize);

  const provider = new JsonRpcProvider("https://rpc1.6529.io");

  for (let i = 0; i < transactions.length; i += batchSize) {
    Logger.info(
      loggerName,
      `Batch ${i / batchSize + 1} of ${totalBatches} - processing...`
    );
    const batch = transactions.slice(i, i + batchSize);
    const batchWithValues = await findTransactionValues(
      provider,
      batch,
      (...args) => Logger.info(loggerName, ...args)
    );
    transactionsWithValues.push(...batchWithValues);
    Logger.info(
      loggerName,
      `Batch ${i / batchSize + 1} of ${totalBatches} - processed!`
    );
  }

  Logger.info(
    loggerName,
    `Found ${transactionsWithValues.length} transactions with values`
  );

  await dataSource.transaction(async (transactionalEntityManager) => {
    await transactionalEntityManager
      .getRepository(Transaction)
      .save(transactionsWithValues);
    await transactionalEntityManager.getRepository(CoreMigration).insert({
      migration_name: migrationName,
    });
  });

  Logger.info(loggerName, `Migration ${migrationName} completed.`);
}

const MEMES_CONTRACT_OBJECT: Contract = {
  name: "The Memes",
  address: MEMES_CONTRACT,
  abi: MEMES_ABI,
  type: ContractType.ERC1155,
};

function getPositiveEditionSize(editionSize: number): number {
  return Number.isInteger(editionSize) && editionSize > 0 ? editionSize : 0;
}

async function updateEditionSizeFloor(
  dataSource: DataSource,
  nft: NFT,
  editionSizeFloor: number
) {
  if (nft.edition_size_floor === editionSizeFloor) {
    return false;
  }

  await dataSource.getRepository(NFT).update(
    {
      contract: nft.contract,
      id: nft.id,
    },
    {
      edition_size_floor: editionSizeFloor,
    }
  );

  return true;
}

async function refreshNftEditionSizeFloor(
  dataSource: DataSource,
  provider: ethers.JsonRpcProvider,
  nft: NFT,
  contract: Contract
) {
  const ethersContract = new ethers.Contract(
    contract.address,
    contract.abi,
    provider
  );
  const editionSizes = await getEditionSizes(
    dataSource,
    contract.address,
    ethersContract,
    nft.id,
    {
      provider,
      refreshEditionSizeFloor: true,
      backfillMissingEditionSizeFloor: true,
    }
  );

  const tokenUri = await getTokenUri(contract.type, ethersContract, nft.id);
  const metadataUri = tokenUri || nft.uri;

  if (metadataUri) {
    try {
      const updatedNft = await retrieveNftFromURI(
        dataSource,
        contract.address,
        nft.id,
        metadataUri,
        editionSizes
      );
      await dataSource.getRepository(NFT).save(updatedNft);
      return "full";
    } catch (error) {
      Logger.warn(
        loggerName,
        `Failed to refresh metadata for ${contract.name} #${nft.id}; saving edition-size fields only.`,
        error
      );
    }
  }

  await dataSource.getRepository(NFT).update(
    {
      contract: nft.contract,
      id: nft.id,
    },
    {
      edition_size: editionSizes.editionSize,
      edition_size_floor: editionSizes.editionSizeFloor,
      burns: editionSizes.burnt,
    }
  );

  return "fields";
}

async function runNftEditionSizeFloorMigration(dataSource: DataSource) {
  const migrationName = "nftEditionSizeFloorBackfill";

  if (await hasMigrationRun(dataSource, migrationName)) {
    return;
  }

  Logger.info(loggerName, `Running migration ${migrationName}...`);

  const nftRepository = dataSource.getRepository(NFT);
  const nfts = await nftRepository.find({
    order: {
      contract: "ASC",
      id: "ASC",
    },
  });

  Logger.info(loggerName, `Found ${nfts.length} NFTs to scan`);

  const provider = new JsonRpcProvider("https://rpc1.6529.io");
  let copiedFloors = 0;
  let fullRefreshes = 0;
  let fieldRefreshes = 0;
  let nonMemeFloors = 0;
  let failedRefreshes = 0;

  for (const nft of nfts) {
    const editionSize = getPositiveEditionSize(nft.edition_size);

    if (!areEqualAddresses(nft.contract, MEMES_CONTRACT)) {
      if (await updateEditionSizeFloor(dataSource, nft, editionSize)) {
        copiedFloors++;
      }
      nonMemeFloors++;
      continue;
    }

    if (editionSize >= EDITION_SIZE_FLOOR_FULL_REFRESH_THRESHOLD) {
      if (await updateEditionSizeFloor(dataSource, nft, editionSize)) {
        copiedFloors++;
      }
      continue;
    }

    try {
      const refreshResult = await refreshNftEditionSizeFloor(
        dataSource,
        provider,
        nft,
        MEMES_CONTRACT_OBJECT
      );
      if (refreshResult === "full") {
        fullRefreshes++;
      } else {
        fieldRefreshes++;
      }
    } catch (error) {
      failedRefreshes++;
      Logger.warn(
        loggerName,
        `Failed to refresh The Memes #${nft.id}; migration will retry on next startup.`,
        error
      );
    }
  }

  if (failedRefreshes === 0) {
    await dataSource.getRepository(CoreMigration).insert({
      migration_name: migrationName,
    });
  }

  Logger.info(
    loggerName,
    failedRefreshes === 0
      ? `Migration ${migrationName} completed.`
      : `Migration ${migrationName} partially completed and will retry.`,
    `Copied floors: ${copiedFloors}.`,
    `Full refreshes: ${fullRefreshes}.`,
    `Field refreshes: ${fieldRefreshes}.`,
    `Non-Meme rows normalized: ${nonMemeFloors}.`,
    `Failed refreshes: ${failedRefreshes}.`
  );
}
