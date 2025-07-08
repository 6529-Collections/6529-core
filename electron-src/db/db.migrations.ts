import { DataSource, MoreThan, Not } from "typeorm";
import { CoreMigration } from "./entities/ICoreMigration";
import Logger from "electron-log";
import { Transaction } from "./entities/ITransaction";
import { NULL_ADDRESS } from "../../electron-constants";
import { NEXTGEN_CONTRACT } from "../../shared/abis/nextgen";
import { findTransactionValues } from "../scheduled-tasks/workers/transactions-worker/transaction-values";
import { JsonRpcProvider } from "ethers";

const loggerName = "[DB MIGRATIONS]";

export async function runCoreMigrations(dataSource: DataSource) {
  await runBlurRoyaltiesMigration(dataSource);
}

async function runBlurRoyaltiesMigration(dataSource: DataSource) {
  const migrationName = "blurRoyalties";

  const existing = await dataSource.getRepository(CoreMigration).findOne({
    where: { migration_name: migrationName },
  });

  if (existing) {
    Logger.info(loggerName, `Migration ${migrationName} already applied.`);
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
