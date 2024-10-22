import { MANIFOLD_ADDRESS, NULL_ADDRESS } from "../../../../constants";
import { areEqualAddresses } from "../../../../shared/helpers";
import { Transaction } from "../../../db/entities/ITransaction";

export interface NFTOwnerDelta {
  address: string;
  contract: string;
  tokenId: number;
  delta: number;
}

export async function extractNFTOwnerDeltas(
  transactions: Transaction[]
): Promise<NFTOwnerDelta[]> {
  const ownersMap: Record<string, NFTOwnerDelta> = {};

  for (const transaction of transactions) {
    const fromKey = `${transaction.contract}:${transaction.token_id}:${transaction.from_address}`;
    const toKey = `${transaction.contract}:${transaction.token_id}:${transaction.to_address}`;

    if (
      !areEqualAddresses(transaction.from_address, NULL_ADDRESS) &&
      !areEqualAddresses(transaction.from_address, MANIFOLD_ADDRESS)
    ) {
      if (!ownersMap[fromKey]) {
        ownersMap[fromKey] = {
          address: transaction.from_address.toLowerCase(),
          contract: transaction.contract.toLowerCase(),
          tokenId: transaction.token_id,
          delta: -transaction.token_count,
        };
      } else {
        ownersMap[fromKey].delta -= transaction.token_count;
      }
    }

    if (!ownersMap[toKey]) {
      ownersMap[toKey] = {
        address: transaction.to_address.toLowerCase(),
        contract: transaction.contract.toLowerCase(),
        tokenId: transaction.token_id,
        delta: transaction.token_count,
      };
    } else {
      ownersMap[toKey].delta += transaction.token_count;
    }
  }

  return Object.values(ownersMap);
}
