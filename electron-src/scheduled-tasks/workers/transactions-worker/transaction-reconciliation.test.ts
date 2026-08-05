import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Transaction } from "../../../db/entities/ITransaction";
import {
  diffTransactions,
  getTransactionIdentity,
  hasTransactionRepairs,
} from "./transaction-reconciliation";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    transaction: "0xhash",
    block: 100,
    transaction_date: 1_700_000_000,
    from_address: "0xfrom",
    to_address: "0xto",
    contract: "0xcontract",
    token_id: 1,
    token_count: 1,
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
    ...overrides,
  };
}

describe("transaction reconciliation diff", () => {
  it("leaves chain-equivalent transactions untouched", () => {
    const chain = transaction();
    const local = transaction({ value: 2, royalties: 0.1 });

    const result = diffTransactions([chain], [local]);

    assert.deepEqual(result.unchanged, [local]);
    assert.equal(hasTransactionRepairs(result), false);
    assert.deepEqual(result.affectedTokens, []);
  });

  it("normalizes addresses and hashes when matching identities", () => {
    const chain = transaction({
      transaction: "0xABC",
      contract: "0xCONTRACT",
      from_address: "0xFROM",
      to_address: "0xTO",
    });
    const local = transaction({ transaction: "0xabc" });

    assert.equal(getTransactionIdentity(chain), getTransactionIdentity(local));
    assert.equal(diffTransactions([chain], [local]).unchanged.length, 1);
  });

  it("classifies missing, inconsistent, and orphaned transactions", () => {
    const missing = transaction({ transaction: "0xmissing", token_id: 1 });
    const inconsistentChain = transaction({
      transaction: "0xchanged",
      token_id: 2,
      token_count: 3,
    });
    const inconsistentLocal = transaction({
      transaction: "0xchanged",
      token_id: 2,
      token_count: 1,
    });
    const orphaned = transaction({
      transaction: "0xorphaned",
      token_id: 3,
    });

    const result = diffTransactions(
      [missing, inconsistentChain],
      [inconsistentLocal, orphaned]
    );

    assert.deepEqual(result.missing, [missing]);
    assert.deepEqual(result.inconsistent, [
      { local: inconsistentLocal, chain: inconsistentChain },
    ]);
    assert.deepEqual(result.orphaned, [orphaned]);
    assert.deepEqual(result.affectedTokens, [
      { contract: "0xcontract", tokenId: 1 },
      { contract: "0xcontract", tokenId: 2 },
      { contract: "0xcontract", tokenId: 3 },
    ]);
    assert.equal(hasTransactionRepairs(result), true);
  });
});
