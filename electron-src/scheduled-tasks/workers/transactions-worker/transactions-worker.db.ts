import { MEMES_START_BLOCK } from "../../../../shared/abis/memes";
import { DataSource } from "typeorm";
import { Transaction } from "../../../db/entities/ITransaction";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { NFTOwnerDelta } from "./nft-owners";

export async function getLatestTransactionsBlock(
  db: DataSource
): Promise<number> {
  const latestTransaction = await db.manager.find(Transaction, {
    order: { block: "DESC" },
    take: 1,
  });
  return latestTransaction?.[0]?.block ?? MEMES_START_BLOCK;
}

export async function persistTransactionsAndOwners(
  db: DataSource,
  transactions: Transaction[],
  ownerDeltas: NFTOwnerDelta[]
) {
  await db.transaction(async (transaction) => {
    const transactionRepository = transaction.getRepository(Transaction);
    const ownerRepository = transaction.getRepository(NFTOwner);

    await transactionRepository.upsert(transactions, [
      "transaction",
      "contract",
      "from_address",
      "to_address",
      "token_id",
    ]);

    for (const ownerDelta of ownerDeltas) {
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
        } else if (owner.balance === 0) {
          await ownerRepository.remove(owner);
        } else {
          await ownerRepository.save(owner);
        }
      } else {
        if (ownerDelta.delta < 0) {
          throw new Error(
            `Negative balance while creating new owner [Delta ${ownerDelta}]`
          );
        }
        await ownerRepository.insert({
          contract: ownerDelta.contract,
          address: ownerDelta.address,
          token_id: ownerDelta.tokenId,
          balance: ownerDelta.delta,
        });
      }
    }
  });
}
