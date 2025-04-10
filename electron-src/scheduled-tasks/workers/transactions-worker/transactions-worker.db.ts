import { DataSource, EntityManager, LessThanOrEqual } from "typeorm";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { extractNFTOwnerDeltas, NFTOwnerDelta } from "./nft-owners";
import { batchUpsert, logInfo } from "../../worker-helpers";

export async function getLatestTransactionsBlock(
  db: EntityManager
): Promise<number> {
  const repo = db.getRepository(TransactionBlock);
  const block = await repo.findOne({ where: { id: 1 } });
  return block?.block ?? 0;
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
