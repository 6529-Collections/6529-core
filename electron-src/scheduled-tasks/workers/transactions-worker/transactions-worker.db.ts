import { Between, DataSource, EntityManager, LessThanOrEqual } from "typeorm";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { extractNFTOwnerDeltas, NFTOwnerDelta } from "./nft-owners";
import { batchUpsert, logInfo } from "../../worker-helpers";
import type { TransactionTokenKey } from "./transaction-reconciliation";

export async function getLatestTransactionsBlock(
  db: EntityManager
): Promise<number> {
  const repo = db.getRepository(TransactionBlock);
  const block = await repo.findOne({ where: { id: 1 } });
  return block?.block ?? 0;
}

export async function getTransactionsInBlockRange(
  db: EntityManager,
  fromBlock: number,
  toBlock: number
): Promise<Transaction[]> {
  return await db.getRepository(Transaction).find({
    where: {
      block: Between(fromBlock, toBlock),
    },
  });
}

export async function setTdhRecalculationNeeded(
  db: EntityManager,
  needed: boolean
) {
  await db.getRepository(TransactionBlock).update(
    { id: 1 },
    {
      tdh_needs_recalculation: needed,
    }
  );
}

export class OwnerDeltaError extends Error {
  private delta: number;
  private address: string;
  private contract: string;
  private tokenId: number;

  constructor(
    delta: number,
    address: string,
    contract: string,
    tokenId: number
  ) {
    super(
      `Negative balance while updating existing owner [Delta ${delta}] [Owner ${address}] [Contract ${contract}] [Token ID ${tokenId}]`
    );
    this.name = "OwnerDeltaError";
    this.delta = delta;
    this.address = address;
    this.contract = contract;
    this.tokenId = tokenId;
  }

  getDelta() {
    return this.delta;
  }

  getAddress() {
    return this.address;
  }

  getContract() {
    return this.contract;
  }

  getTokenId() {
    return this.tokenId;
  }
}

export async function persistTransactionsAndOwners(
  db: DataSource,
  transactions: Transaction[],
  ownerDeltas: NFTOwnerDelta[],
  block: number,
  timestamp: number,
  maxRetries: number = 5,
  delayMs: number = 100
) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await db.transaction(async (transaction) => {
        const transactionRepository = transaction.getRepository(Transaction);
        const transactionBlockRepository =
          transaction.getRepository(TransactionBlock);

        await batchUpsert<Transaction>(transactionRepository, transactions, [
          "transaction",
          "contract",
          "from_address",
          "to_address",
          "token_id",
        ]);

        await persistOwners(transaction, ownerDeltas);

        await transactionBlockRepository.upsert(
          {
            id: 1,
            block,
            timestamp,
          },
          ["id"]
        );
      });
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("database is locked")
      ) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(
            `Updating Database failed after ${maxRetries} retries due to database lock.`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
}

export async function recalculateTransactionOwners(
  db: EntityManager,
  parentPort: any
) {
  logInfo(parentPort, "Recalculating Transactions Owners");

  const block = await getLatestTransactionsBlock(db);
  logInfo(parentPort, "Latest transactions block", block);

  const allTransactions = await db.getRepository(Transaction).find({
    where: {
      block: LessThanOrEqual(block),
    },
  });

  logInfo(parentPort, "All transactions", allTransactions.length);

  const ownerDeltas = await extractNFTOwnerDeltas(allTransactions);

  logInfo(parentPort, "All owner deltas", ownerDeltas.length);

  await db.transaction(async (transaction) => {
    const ownerRepository = transaction.getRepository(NFTOwner);
    await ownerRepository.clear();
    await persistOwners(transaction, ownerDeltas);
  });

  logInfo(parentPort, "All transactions owners recalculated");
}

export async function rebuildTransactionOwnersForTokens(
  db: EntityManager,
  affectedTokens: TransactionTokenKey[],
  latestBlock: number
) {
  const transactionRepository = db.getRepository(Transaction);
  const ownerRepository = db.getRepository(NFTOwner);

  for (const affectedToken of affectedTokens) {
    const transactions = await transactionRepository.find({
      where: {
        contract: affectedToken.contract,
        token_id: affectedToken.tokenId,
        block: LessThanOrEqual(latestBlock),
      },
    });
    const ownerDeltas = await extractNFTOwnerDeltas(transactions);

    await ownerRepository.delete({
      contract: affectedToken.contract,
      token_id: affectedToken.tokenId,
    });
    await persistOwners(db, ownerDeltas);
  }
}

function getTransactionDeleteCriteria(transaction: Transaction) {
  return {
    transaction: transaction.transaction,
    contract: transaction.contract,
    from_address: transaction.from_address,
    to_address: transaction.to_address,
    token_id: transaction.token_id,
  };
}

export async function applyTransactionReconciliation(
  db: DataSource,
  repairs: Transaction[],
  orphaned: Transaction[],
  affectedTokens: TransactionTokenKey[],
  latestBlock: number,
  maxRetries: number = 5,
  delayMs: number = 100
) {
  if (
    repairs.length === 0 &&
    orphaned.length === 0 &&
    affectedTokens.length === 0
  ) {
    return;
  }

  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await db.transaction(async (manager) => {
        const transactionRepository = manager.getRepository(Transaction);

        for (const orphanedTransaction of orphaned) {
          await transactionRepository.delete(
            getTransactionDeleteCriteria(orphanedTransaction)
          );
        }

        await batchUpsert<Transaction>(transactionRepository, repairs, [
          "transaction",
          "contract",
          "from_address",
          "to_address",
          "token_id",
        ]);

        await rebuildTransactionOwnersForTokens(
          manager,
          affectedTokens,
          latestBlock
        );
        await setTdhRecalculationNeeded(manager, true);
      });
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("database is locked")
      ) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(
            `Transaction reconciliation failed after ${maxRetries} retries due to database lock.`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
}

export async function extractOwnersFromDeltas(
  transaction: EntityManager,
  ownerDeltas: NFTOwnerDelta[]
) {
  const ownerRepository = transaction.getRepository(NFTOwner);
  const nftOwnerPromises: Promise<NFTOwner>[] = ownerDeltas.map(
    async (ownerDelta) => {
      const owner = await ownerRepository.findOne({
        where: {
          contract: ownerDelta.contract,
          address: ownerDelta.address,
          token_id: ownerDelta.tokenId,
        },
      });

      if (owner) {
        owner.balance += ownerDelta.delta;
        if (owner.balance < 0) {
          throw new OwnerDeltaError(
            ownerDelta.delta,
            owner.address,
            owner.contract,
            owner.token_id
          );
        } else {
          return owner;
        }
      } else {
        if (ownerDelta.delta < 0) {
          throw new OwnerDeltaError(
            ownerDelta.delta,
            ownerDelta.address,
            ownerDelta.contract,
            ownerDelta.tokenId
          );
        }
        return {
          contract: ownerDelta.contract,
          address: ownerDelta.address,
          token_id: ownerDelta.tokenId,
          balance: ownerDelta.delta,
        };
      }
    }
  );
  return await Promise.all(nftOwnerPromises);
}

export async function persistOwners(
  transaction: EntityManager,
  ownerDeltas: NFTOwnerDelta[]
) {
  const nftOwners = await extractOwnersFromDeltas(transaction, ownerDeltas);
  const ownerRepository = transaction.getRepository(NFTOwner);
  await batchUpsert<NFTOwner>(ownerRepository, nftOwners, [
    "contract",
    "address",
    "token_id",
  ]);
  await ownerRepository.delete({ balance: 0 });
}
