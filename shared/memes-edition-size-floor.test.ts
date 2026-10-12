import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADIENT_CONTRACT } from "./abis/gradient";
import { MEMES_CONTRACT } from "./abis/memes";
import {
  calculateHodlRate,
  getCalculationEditionSize,
  getMemeEditionSizeFloor,
  getMemeTokenIdsForEditionSizeFloorRefresh,
  repairMemeCatchUpEditionSizeFloor,
  selectMemeEditionSizeFloorRefreshIds,
} from "./memes-edition-size-floor";

describe("meme edition size floor helpers", () => {
  it("caps positive Manifold claim totals at 310", () => {
    assert.equal(getMemeEditionSizeFloor(500), 310);
    assert.equal(getMemeEditionSizeFloor(310), 310);
    assert.equal(getMemeEditionSizeFloor(168), 168);
    assert.equal(getMemeEditionSizeFloor(500n), 310);
    assert.equal(getMemeEditionSizeFloor("320"), 310);
  });

  it("ignores unavailable or invalid claim totals", () => {
    assert.equal(getMemeEditionSizeFloor(null), null);
    assert.equal(getMemeEditionSizeFloor(undefined), null);
    assert.equal(getMemeEditionSizeFloor(0), null);
    assert.equal(getMemeEditionSizeFloor(-1), null);
    assert.equal(getMemeEditionSizeFloor(1.5), null);
    assert.equal(getMemeEditionSizeFloor("not-a-number"), null);
  });

  it("uses the larger value from actual supply and edition floor", () => {
    assert.equal(
      getCalculationEditionSize({
        actualSupply: 168,
        editionSizeFloor: 310,
      }),
      310,
    );
    assert.equal(
      getCalculationEditionSize({
        actualSupply: 652,
        editionSizeFloor: 310,
      }),
      652,
    );
    assert.equal(
      getCalculationEditionSize({
        actualSupply: 101,
        editionSizeFloor: 0,
      }),
      101,
    );
  });

  it("clamps hodl rates to a minimum of 1", () => {
    assert.equal(calculateHodlRate(3939, 310), 3939 / 310);
    assert.equal(calculateHodlRate(100, 310), 1);
    assert.equal(calculateHodlRate(100, 0), 1);
    assert.equal(calculateHodlRate(100, -1), 1);
  });

  it("refreshes the verified latest Meme", () => {
    assert.deepEqual(
      getMemeTokenIdsForEditionSizeFloorRefresh(
        [
          { contract: MEMES_CONTRACT, id: 1 },
          { contract: MEMES_CONTRACT, id: 2 },
          { contract: MEMES_CONTRACT, id: 5 },
          { contract: GRADIENT_CONTRACT, id: 999 },
        ],
        true,
      ),
      [5],
    );
  });

  it("returns no refresh ids when there are no Memes", () => {
    assert.deepEqual(
      getMemeTokenIdsForEditionSizeFloorRefresh(
        [{ contract: GRADIENT_CONTRACT, id: 1 }],
        true,
      ),
      [],
    );
  });

  it("does not treat the highest local Meme as latest while discovery waits", async () => {
    for (const id of [206, 215, 311]) {
      const ids = await selectMemeEditionSizeFloorRefreshIds(
        [{ contract: MEMES_CONTRACT, id, mint_date: 1700000000 }],
        async (nextId) => {
          assert.equal(nextId, id + 1);
          return "ipfs://already-minted-later-card";
        },
        Date.UTC(2026, 9, 12),
      );
      assert.deepEqual(ids, []);
    }
  });

  it("keeps refreshing recent cards after discovery advances past them", async () => {
    const now = Date.UTC(2026, 9, 12);
    const secondsAgo = (days: number) => now / 1000 - days * 86400;
    const nfts = [
      { contract: MEMES_CONTRACT, id: 215, mint_date: secondsAgo(500) },
      { contract: MEMES_CONTRACT, id: 557, mint_date: secondsAgo(30) },
      { contract: MEMES_CONTRACT, id: 558, mint_date: secondsAgo(1) },
      { contract: GRADIENT_CONTRACT, id: 999, mint_date: secondsAgo(1) },
    ];
    assert.deepEqual(
      await selectMemeEditionSizeFloorRefreshIds(
        nfts,
        async (id) => String(id),
        now,
      ),
      [557, 558],
    );
    assert.deepEqual(
      await selectMemeEditionSizeFloorRefreshIds(
        nfts,
        async () => "ipfs://later-card",
        now,
      ),
      [557, 558],
    );
  });

  it("skips an unverified historical latest card on RPC failure", async () => {
    assert.deepEqual(
      await selectMemeEditionSizeFloorRefreshIds(
        [{ contract: MEMES_CONTRACT, id: 215 }],
        async () => {
          throw new Error("RPC unavailable");
        },
      ),
      [],
    );
  });

  it("refreshes an old or undated latest Meme once chain discovery is verified", async () => {
    assert.deepEqual(
      await selectMemeEditionSizeFloorRefreshIds(
        [{ contract: MEMES_CONTRACT, id: 558 }],
        async (id) => String(id),
      ),
      [558],
    );
  });

  it("corrects only the confirmed historical 310 floors", () => {
    assert.equal(
      repairMemeCatchUpEditionSizeFloor(
        { contract: MEMES_CONTRACT, id: 215 },
        310,
      ),
      309,
    );
    assert.equal(
      repairMemeCatchUpEditionSizeFloor(
        { contract: MEMES_CONTRACT, id: 215 },
        305,
      ),
      305,
    );
    assert.equal(
      repairMemeCatchUpEditionSizeFloor(
        { contract: MEMES_CONTRACT, id: 558 },
        310,
      ),
      310,
    );
    assert.equal(
      repairMemeCatchUpEditionSizeFloor(
        { contract: GRADIENT_CONTRACT, id: 215 },
        310,
      ),
      310,
    );
  });
});
