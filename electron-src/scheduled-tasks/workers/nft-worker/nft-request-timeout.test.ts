import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { selectMemeEditionSizeFloorRefreshIds } from "../../../../shared/memes-edition-size-floor";
import { withTimeout } from "./nft-request-timeout";

describe("Meme refresh probe timeouts", () => {
  const now = Date.UTC(2026, 9, 12);
  const timedOutProbe = () =>
    withTimeout(new Promise<string>(() => {}), 1, "NFT URI probe timed out");

  it("keeps a historical local latest unverified on the production timeout path", async () => {
    const ids = await selectMemeEditionSizeFloorRefreshIds(
      [{ contract: MEMES_CONTRACT, id: 215, mint_date: 1700000000 }],
      timedOutProbe,
      now,
    );
    assert.deepEqual(ids, []);
  });

  it("retains the backend's recent-card refresh window after a probe timeout", async () => {
    const ids = await selectMemeEditionSizeFloorRefreshIds(
      [{ contract: MEMES_CONTRACT, id: 558, mint_date: now / 1000 - 86400 }],
      timedOutProbe,
      now,
    );
    assert.deepEqual(ids, [558]);
  });
});
