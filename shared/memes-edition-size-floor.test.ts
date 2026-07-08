import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRADIENT_CONTRACT } from "./abis/gradient";
import { MEMES_CONTRACT } from "./abis/memes";
import {
  calculateHodlRate,
  getCalculationEditionSize,
  getMemeEditionSizeFloor,
  getMemeTokenIdsForEditionSizeFloorRefresh,
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

  it("refreshes only the latest Meme", () => {
    assert.deepEqual(
      getMemeTokenIdsForEditionSizeFloorRefresh([
        { contract: MEMES_CONTRACT, id: 1 },
        { contract: MEMES_CONTRACT, id: 2 },
        { contract: MEMES_CONTRACT, id: 5 },
        { contract: GRADIENT_CONTRACT, id: 999 },
      ]),
      [5],
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
