import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADIENT_CONTRACT } from "./abis/gradient";
import { MEMES_CONTRACT } from "./abis/memes";
import {
  calculateHodlRate,
  getCalculationEditionSize,
  getMemeEditionSizeFloor,
  getMemeTokenIdsForEditionSizeFloorRefresh,
  MEMES_EDITION_SIZE_FLOOR_REFRESH_WINDOW_MS,
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

  it("refreshes latest Meme and Memes minted inside the 30-day window", () => {
    const nowMillis = Date.UTC(2026, 0, 31, 0, 0, 0);
    const boundaryMintSeconds = Math.floor(
      (nowMillis - MEMES_EDITION_SIZE_FLOOR_REFRESH_WINDOW_MS) / 1000,
    );
    const oldMintSeconds = boundaryMintSeconds - 1;
    const recentMintSeconds = boundaryMintSeconds + 1;

    assert.deepEqual(
      getMemeTokenIdsForEditionSizeFloorRefresh(
        [
          { contract: MEMES_CONTRACT, id: 1, mint_date: oldMintSeconds },
          { contract: MEMES_CONTRACT, id: 2, mint_date: boundaryMintSeconds },
          { contract: MEMES_CONTRACT, id: 3, mint_date: recentMintSeconds },
          { contract: MEMES_CONTRACT, id: 5, mint_date: oldMintSeconds },
          { contract: GRADIENT_CONTRACT, id: 999, mint_date: recentMintSeconds },
        ],
        nowMillis,
      ),
      [2, 3, 5],
    );
  });

  it("returns no refresh ids when there are no Memes", () => {
    assert.deepEqual(
      getMemeTokenIdsForEditionSizeFloorRefresh([
        { contract: GRADIENT_CONTRACT, id: 1, mint_date: 1 },
      ]),
      [],
    );
  });
});
