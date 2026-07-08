import { DataSource, MoreThan, Not } from "typeorm";
import { CoreMigration } from "./entities/ICoreMigration";
import Logger from "electron-log";
import { Transaction } from "./entities/ITransaction";
import { NULL_ADDRESS } from "../../electron-constants";
import { NEXTGEN_CONTRACT } from "../../shared/abis/nextgen";
import { findTransactionValues } from "../scheduled-tasks/workers/transactions-worker/transaction-values";
import { ethers, JsonRpcProvider } from "ethers";
import { NFT } from "./entities/INFT";
import { getEditionSizes } from "../scheduled-tasks/workers/nft-worker/nft-worker";
import { MEMES_ABI, MEMES_CONTRACT } from "../../shared/abis/memes";
import { areEqualAddresses } from "../../shared/helpers";

const loggerName = "[DB MIGRATIONS]";

export async function runCoreMigrations(dataSource: DataSource) {
  await runBlurRoyaltiesMigration(dataSource);
  await runNftEditionSizeFloorMigration(dataSource);
}

async function hasMigrationRun(
  dataSource: DataSource,
  migrationName: string,
  logIfApplied: boolean = true
) {
  const existing = await dataSource.getRepository(CoreMigration).findOne({
    where: { migration_name: migrationName },
  });

  if (existing) {
    if (logIfApplied) {
      Logger.info(loggerName, `Migration ${migrationName} already applied.`);
    }
    return true;
  }

  return false;
}

async function recordMigrationIfNeeded(
  dataSource: DataSource,
  migrationName: string
) {
  if (await hasMigrationRun(dataSource, migrationName, false)) {
    return;
  }

  await dataSource.getRepository(CoreMigration).insert({
    migration_name: migrationName,
  });
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

function getPositiveEditionSize(
  editionSize: number | null | undefined
): number {
  return typeof editionSize === "number" &&
    Number.isInteger(editionSize) &&
    editionSize > 0
    ? editionSize
    : 0;
}

function getEditionSizeFloorFromSupply(
  editionSize: number | null | undefined
): number | null {
  const positiveEditionSize = getPositiveEditionSize(editionSize);
  return positiveEditionSize > 0 ? positiveEditionSize : null;
}

async function updateEditionSizeFloor(
  dataSource: DataSource,
  nft: NFT,
  editionSizeFloor: number | null
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

async function updateNftEditionFields(
  dataSource: DataSource,
  nft: NFT,
  editionSize: number,
  editionSizeFloor: number,
  burns: number
) {
  if (
    nft.edition_size === editionSize &&
    nft.edition_size_floor === editionSizeFloor &&
    nft.burns === burns
  ) {
    return false;
  }

  await dataSource.getRepository(NFT).update(
    {
      contract: nft.contract,
      id: nft.id,
    },
    {
      edition_size: editionSize,
      edition_size_floor: editionSizeFloor,
      burns,
    }
  );

  return true;
}

async function runNftEditionSizeFloorMigration(dataSource: DataSource) {
  const migrationName = "nftEditionSizeFloorLatestMemeRepair";
  const migrationAlreadyRecorded = await hasMigrationRun(
    dataSource,
    migrationName,
    false
  );

  const nftRepository = dataSource.getRepository(NFT);
  const missingFloorCount = await nftRepository
    .createQueryBuilder("nft")
    .where(
      "(nft.edition_size_floor IS NULL OR nft.edition_size_floor <= 0) AND nft.edition_size > 0"
    )
    .getCount();

  if (migrationAlreadyRecorded && missingFloorCount === 0) {
    Logger.info(loggerName, `Migration ${migrationName} already applied.`);
    return;
  }

  const nfts = await nftRepository.find({
    order: {
      contract: "ASC",
      id: "ASC",
    },
  });

  if (nfts.length === 0) {
    Logger.info(
      loggerName,
      `Migration ${migrationName} found no NFTs to scan; deferring.`
    );
    return;
  }

  Logger.info(
    loggerName,
    `Running migration ${migrationName}...`,
    `Found ${nfts.length} NFTs to scan.`,
    `Missing floors: ${missingFloorCount}.`
  );

  const provider = new JsonRpcProvider("https://rpc1.6529.io");
  const memesContract = new ethers.Contract(MEMES_CONTRACT, MEMES_ABI, provider);
  const repairBrokenPositiveFloors = !migrationAlreadyRecorded;
  const latestMemeId = nfts
    .filter((nft) => areEqualAddresses(nft.contract, MEMES_CONTRACT))
    .reduce((latest, nft) => Math.max(latest, nft.id), 0);
  const hasLatestMeme = latestMemeId > 0;
  let copiedFloors = 0;
  let latestMemeRefreshes = 0;
  let nonMemeFloors = 0;
  let failedRefreshes = 0;

  for (const nft of nfts) {
    if (!areEqualAddresses(nft.contract, MEMES_CONTRACT)) {
      const editionSizeFloor = getEditionSizeFloorFromSupply(nft.edition_size);
      if (await updateEditionSizeFloor(dataSource, nft, editionSizeFloor)) {
        copiedFloors++;
      }
      nonMemeFloors++;
      continue;
    }

    if (!hasLatestMeme || nft.id !== latestMemeId) {
      const existingFloor = getPositiveEditionSize(nft.edition_size_floor);
      const editionSizeFloor = repairBrokenPositiveFloors
        ? getEditionSizeFloorFromSupply(nft.edition_size)
        : existingFloor || getEditionSizeFloorFromSupply(nft.edition_size);
      if (await updateEditionSizeFloor(dataSource, nft, editionSizeFloor)) {
        copiedFloors++;
      }
      continue;
    }

    try {
      const editionSizes = await getEditionSizes(
        dataSource,
        MEMES_CONTRACT,
        memesContract,
        nft.id,
        {
          provider,
          refreshEditionSizeFloor: true,
          preserveExistingEditionSizeFloor: !repairBrokenPositiveFloors,
        }
      );
      if (
        await updateNftEditionFields(
          dataSource,
          nft,
          editionSizes.editionSize,
          editionSizes.editionSizeFloor,
          editionSizes.burnt
        )
      ) {
        latestMemeRefreshes++;
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
    await recordMigrationIfNeeded(dataSource, migrationName);
  }

  Logger.info(
    loggerName,
    failedRefreshes === 0
      ? `Migration ${migrationName} completed.`
      : `Migration ${migrationName} partially completed and will retry.`,
    `Copied floors: ${copiedFloors}.`,
    `Latest Meme refreshes: ${latestMemeRefreshes}.`,
    `Non-Meme rows normalized: ${nonMemeFloors}.`,
    `Failed refreshes: ${failedRefreshes}.`
  );
}
