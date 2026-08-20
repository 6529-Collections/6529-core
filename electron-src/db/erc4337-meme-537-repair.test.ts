import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ERC4337_MEME_537_REPAIR_IDENTITY,
  ERC4337_MEME_537_REPAIR_VALUES,
  shouldRepairErc4337Meme537Transaction
} from "./erc4337-meme-537-repair";

function candidate(
  overrides: Partial<
    Parameters<typeof shouldRepairErc4337Meme537Transaction>[0]
  > = {}
) {
  return {
    ...ERC4337_MEME_537_REPAIR_IDENTITY,
    token_count: 1,
    value: 0,
    primary_proceeds: 0,
    ...overrides
  };
}

describe("ERC-4337 Meme #537 database repair", () => {
  it("defines the verified replacement values for the exact bad row", () => {
    assert.equal(shouldRepairErc4337Meme537Transaction(candidate()), true);
    assert.deepEqual(ERC4337_MEME_537_REPAIR_VALUES, {
      value: 0.06579,
      primary_proceeds: 0.06529
    });
  });

  it("does not match a different transaction identity", () => {
    assert.equal(
      shouldRepairErc4337Meme537Transaction(
        candidate({ transaction: "0xother" })
      ),
      false
    );
    assert.equal(
      shouldRepairErc4337Meme537Transaction(
        candidate({
          to_address: "0x0000000000000000000000000000000000000001"
        })
      ),
      false
    );
    assert.equal(
      shouldRepairErc4337Meme537Transaction(candidate({ token_id: 538 })),
      false
    );
  });

  it("does not overwrite rows that do not retain the known bad values", () => {
    assert.equal(
      shouldRepairErc4337Meme537Transaction(candidate({ token_count: 2 })),
      false
    );
    assert.equal(
      shouldRepairErc4337Meme537Transaction(candidate({ value: 0.06579 })),
      false
    );
    assert.equal(
      shouldRepairErc4337Meme537Transaction(
        candidate({ primary_proceeds: 0.06529 })
      ),
      false
    );
  });
});
