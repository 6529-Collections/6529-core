import { DataSource, MoreThan, Not } from "typeorm";
import { CoreMigration } from "./entities/ICoreMigration";
import Logger from "electron-log";
import { Transaction } from "./entities/ITransaction";
import { NULL_ADDRESS } from "../../electron-constants";
import { NEXTGEN_CONTRACT } from "../../shared/abis/nextgen";
import { findTransactionValues } from "../scheduled-tasks/workers/transactions-worker/transaction-values";
import { JsonRpcProvider } from "ethers";
import {
  ERC4337_MEME_537_REPAIR_IDENTITY,
  ERC4337_MEME_537_REPAIR_VALUES,
  shouldRepairErc4337Meme537Transaction
} from "./erc4337-meme-537-repair";
import { ensureTransactionBlockRecoveryColumns } from "./transaction-block-schema-migration";
import { repairNftEditionSizeFloors } from "./nft-edition-size-floor-repair";

const loggerName = "[DB MIGRATIONS]";

export async function runCoreMigrations(dataSource: DataSource) {
  await runTransactionBlockRecoverySchemaMigration(dataSource);
  await runErc4337Meme537ValueRepairMigration(dataSource);
  await runBlurRoyaltiesMigration(dataSource);
  await repairNftEditionSizeFloors(dataSource);
}

async function runTransactionBlockRecoverySchemaMigration(
  dataSource: DataSource,
) {
  const migrationName = "transactionBlockRecoverySchema";
  if (await hasMigrationRun(dataSource, migrationName)) {
    return;
  }

  Logger.info(loggerName, `Running migration ${migrationName}...`);
  await ensureTransactionBlockRecoveryColumns(dataSource);
  await recordMigrationIfNeeded(dataSource, migrationName);
  Logger.info(loggerName, `Migration ${migrationName} completed.`);
}

export async function runErc4337Meme537ValueRepairMigration(
  dataSource: DataSource
) {
  const migrationName = "erc4337Meme537ValueRepair";
  if (await hasMigrationRun(dataSource, migrationName)) {
    return;
  }

  Logger.info(loggerName, `Running migration ${migrationName}...`);
  await dataSource.transaction(async (transactionalEntityManager) => {
    const transactionRepository =
      transactionalEntityManager.getRepository(Transaction);
    const candidates = await transactionRepository.find({
      where: {
        transaction: ERC4337_MEME_537_REPAIR_IDENTITY.transaction
      }
    });
    const existing = candidates.find(shouldRepairErc4337Meme537Transaction);

    if (existing) {
      await transactionRepository.update(
        {
          transaction: existing.transaction,
          from_address: existing.from_address,
          to_address: existing.to_address,
          contract: existing.contract,
          token_id: existing.token_id
        },
        ERC4337_MEME_537_REPAIR_VALUES
      );
      Logger.info(
        loggerName,
        `Repaired transaction ${ERC4337_MEME_537_REPAIR_IDENTITY.transaction}.`
      );
    }

    await transactionalEntityManager.getRepository(CoreMigration).insert({
      migration_name: migrationName
    });
  });
  Logger.info(loggerName, `Migration ${migrationName} completed.`);
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
