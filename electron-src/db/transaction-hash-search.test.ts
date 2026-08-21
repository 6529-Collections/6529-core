import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_TRANSACTION_HASH_SEARCH_LENGTH,
  parseTransactionHashSearch,
} from "../../shared/transaction-hash-search";

describe("parseTransactionHashSearch", () => {
  it("normalizes partial hashes with or without a prefix", () => {
    assert.deepEqual(parseTransactionHashSearch("  0xAbCd  "), {
      match: "contains",
      normalizedHash: "abcd",
    });
    assert.deepEqual(parseTransactionHashSearch("ABCDEF"), {
      match: "contains",
      normalizedHash: "abcdef",
    });
  });

  it("uses an exact match for a complete transaction hash", () => {
    const fullHash = "A".repeat(MAX_TRANSACTION_HASH_SEARCH_LENGTH);

    assert.deepEqual(parseTransactionHashSearch(fullHash), {
      match: "exact",
      normalizedHash: fullHash.toLowerCase(),
    });
  });

  it("rejects searches outside the supported length or character set", () => {
    assert.equal(parseTransactionHashSearch("0xabc"), undefined);
    assert.equal(
      parseTransactionHashSearch(
        "a".repeat(MAX_TRANSACTION_HASH_SEARCH_LENGTH + 1),
      ),
      undefined,
    );
    assert.equal(parseTransactionHashSearch("0xhash"), undefined);
    assert.equal(parseTransactionHashSearch("0x"), undefined);
  });
});
