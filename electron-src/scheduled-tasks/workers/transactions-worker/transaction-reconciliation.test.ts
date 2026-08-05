import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Transaction } from "../../../db/entities/ITransaction";
import {
  classifyReceiptTransaction,
  diffTransactions,
  getTransactionIdentity,
  getTransactionTokenKeys,
  hasTransactionRepairs,
  isRpcLogRangeLimitError,
  isRetryableSqliteLockError,
  retryOnSqliteLock,
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

  it("deduplicates affected contract and token pairs", () => {
    assert.deepEqual(
      getTransactionTokenKeys([
        transaction({ contract: "0xCONTRACT", token_id: 1 }),
        transaction({ transaction: "0xother", token_id: 1 }),
        transaction({ transaction: "0xthird", token_id: 2 }),
      ]),
      [
        { contract: "0xcontract", tokenId: 1 },
        { contract: "0xcontract", tokenId: 2 },
      ],
    );
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

  it("treats receipts without decodable transfers as inconclusive", () => {
    assert.deepEqual(
      classifyReceiptTransaction(transaction(), [], 100, 200, 500),
      { status: "inconclusive" }
    );
  });

  it("distinguishes true orphans from omitted and relocated transfers", () => {
    const local = transaction();
    const otherTransfer = transaction({ token_id: 2 });

    assert.deepEqual(
      classifyReceiptTransaction(local, [otherTransfer], 100, 200, 500),
      { status: "orphaned" }
    );

    const omitted = transaction({ block: 150 });
    assert.deepEqual(
      classifyReceiptTransaction(local, [omitted], 100, 200, 500),
      { status: "omitted", canonical: omitted }
    );

    const relocated = transaction({ block: 90 });
    assert.deepEqual(
      classifyReceiptTransaction(local, [relocated], 100, 200, 500),
      { status: "relocated", canonical: relocated }
    );

    const beyondCheckpoint = transaction({ block: 501 });
    assert.deepEqual(
      classifyReceiptTransaction(local, [beyondCheckpoint], 100, 200, 500),
      { status: "beyond-checkpoint", canonical: beyondCheckpoint }
    );
  });

  it("recognizes provider log-result limit errors", () => {
    assert.equal(
      isRpcLogRangeLimitError({
        info: { error: { code: -32005, message: "query limit" } },
      }),
      true
    );
    assert.equal(
      isRpcLogRangeLimitError(
        new Error("Log response size exceeded the provider result limit")
      ),
      true
    );
    assert.equal(
      isRpcLogRangeLimitError(new Error("network unavailable")),
      false
    );
  });

  it("retries SQLite lock failures without retrying unrelated errors", async () => {
    let attempts = 0;
    await retryOnSqliteLock(
      async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error("SQLITE_BUSY: database table is locked");
        }
      },
      2,
      0,
      "Test operation"
    );
    assert.equal(attempts, 2);
    assert.equal(
      isRetryableSqliteLockError(new Error("database is locked")),
      true
    );
    assert.equal(isRetryableSqliteLockError({ code: "SQLITE_BUSY" }), true);

    const unrelatedError = new Error("disk I/O error");
    await assert.rejects(
      retryOnSqliteLock(
        async () => {
          throw unrelatedError;
        },
        2,
        0,
        "Test operation"
      ),
      unrelatedError
    );

    let exhaustedAttempts = 0;
    await assert.rejects(
      retryOnSqliteLock(
        async () => {
          exhaustedAttempts++;
          throw new Error("database is locked");
        },
        2,
        0,
        "Test operation"
      ),
      /Test operation failed after 2 retries/
    );
    assert.equal(exhaustedAttempts, 2);
  });
});
