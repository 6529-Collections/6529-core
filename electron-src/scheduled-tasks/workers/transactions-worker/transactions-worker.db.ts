import { DataSource } from "typeorm";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { NFTOwnerDelta } from "./nft-owners";
import { batchUpsert } from "../../worker-helpers";

export async function getLatestTransactionsBlock(
  db: DataSource
): Promise<number> {
  const repo = db.getRepository(TransactionBlock);
  const block = await repo.findOne({ where: { id: 1 } });
  return block?.block ?? 0;
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
        const ownerRepository = transaction.getRepository(NFTOwner);
        const transactionBlockRepository =
          transaction.getRepository(TransactionBlock);

        await batchUpsert<Transaction>(transactionRepository, transactions, [
          "transaction",
          "contract",
          "from_address",
          "to_address",
          "token_id",
        ]);

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
                throw new Error(
                  `Negative balance while updating existing owner [Delta ${ownerDelta.delta}] [Owner ${owner.address}] [Contract ${owner.contract}] [Token ID ${owner.token_id}] [Balance ${owner.balance}]`
                );
              } else {
                return owner;
              }
            } else {
              if (ownerDelta.delta < 0) {
                throw new Error(
                  `Negative balance while creating new owner [Delta ${ownerDelta.delta}] [Owner ${ownerDelta.address}] [Contract ${ownerDelta.contract}] [Token ID ${ownerDelta.tokenId}]`
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

        const nftOwners = await Promise.all(nftOwnerPromises);

        await batchUpsert<NFTOwner>(ownerRepository, nftOwners, [
          "contract",
          "address",
          "token_id",
        ]);

        await ownerRepository.delete({ balance: 0 });

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
