import { NULL_ADDRESS } from "../../electron-constants";
import { MEMES_CONTRACT } from "../../shared/abis/memes";
import type { Transaction } from "./entities/ITransaction";

export const ERC4337_MEME_537_REPAIR_IDENTITY = {
  transaction:
    "0x87965828d5ed44d26b0244b93c7cee1caa1810c0bd513d7e0bb4a738e430d346",
  from_address: NULL_ADDRESS,
  to_address: "0xa88fe6fa01fcc112bb2164c6e37d63395b923e5f",
  contract: MEMES_CONTRACT.toLowerCase(),
  token_id: 537
} as const;

export const ERC4337_MEME_537_REPAIR_VALUES = {
  value: 0.06579,
  primary_proceeds: 0.06529
} as const;

type RepairCandidate = Pick<
  Transaction,
  | "transaction"
  | "from_address"
  | "to_address"
  | "contract"
  | "token_id"
  | "token_count"
  | "value"
  | "primary_proceeds"
>;

export function shouldRepairErc4337Meme537Transaction(
  transaction: RepairCandidate
): boolean {
  return (
    transaction.transaction.toLowerCase() ===
      ERC4337_MEME_537_REPAIR_IDENTITY.transaction &&
    transaction.from_address.toLowerCase() ===
      ERC4337_MEME_537_REPAIR_IDENTITY.from_address &&
    transaction.to_address.toLowerCase() ===
      ERC4337_MEME_537_REPAIR_IDENTITY.to_address &&
    transaction.contract.toLowerCase() ===
      ERC4337_MEME_537_REPAIR_IDENTITY.contract &&
    transaction.token_id === ERC4337_MEME_537_REPAIR_IDENTITY.token_id &&
    transaction.token_count === 1 &&
    transaction.value === 0 &&
    transaction.primary_proceeds === 0
  );
}
