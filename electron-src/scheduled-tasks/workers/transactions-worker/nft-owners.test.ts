import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NULL_ADDRESS } from "../../../../electron-constants";
import type { Transaction } from "../../../db/entities/ITransaction";
import { extractNFTOwnerDeltas } from "./nft-owners";

function transfer(
  fromAddress: string,
  toAddress: string,
  tokenCount: number
): Transaction {
  return {
    transaction: "0xhash",
    block: 100,
    transaction_date: 1_700_000_000,
    from_address: fromAddress,
    to_address: toAddress,
    contract: "0xcontract",
    token_id: 1,
    token_count: tokenCount,
    value: 0,
    primary_proceeds: 0,
    royalties: 0,
    gas_gwei: 0,
    gas_price: 0,
    gas_price_gwei: 0,
    gas: 0,
    eth_price_usd: 0,
    value_usd: 0,
    gas_usd: 0,
  };
}

describe("NFT owner rebuild data", () => {
  it("derives final ownership from a token's complete corrected history", async () => {
    const deltas = await extractNFTOwnerDeltas([
      transfer(NULL_ADDRESS, "0xowner-a", 3),
      transfer("0xowner-a", "0xowner-b", 1),
    ]);

    assert.deepEqual(
      deltas
        .map(({ address, delta }) => ({ address, delta }))
        .sort((a, b) => a.address.localeCompare(b.address)),
      [
        { address: "0xowner-a", delta: 2 },
        { address: "0xowner-b", delta: 1 },
      ]
    );
  });
});
