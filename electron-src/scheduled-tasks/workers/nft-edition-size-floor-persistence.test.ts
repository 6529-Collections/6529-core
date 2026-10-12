import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DataSource } from "typeorm";
import { MEMES_CONTRACT } from "../../../shared/abis/memes";
import type { NFT } from "../../db/entities/INFT";
import { preserveEditionSizeFloors } from "./nft-edition-size-floor-persistence";

function nft(id: number, supply: number, floor: number | null): NFT {
  return {
    contract: MEMES_CONTRACT,
    id,
    edition_size: supply,
    edition_size_floor: floor,
  } as NFT;
}

function fixtureDb(existing: NFT[]) {
  const query = {
    select: () => query,
    where: () => query,
    getMany: async () => existing,
  };
  return {
    getRepository: () => ({ createQueryBuilder: () => query }),
  } as unknown as DataSource;
}

describe("NFT edition size floor persistence", () => {
  it("does not reintroduce a repaired floor from stale discovery or TDH metadata", async () => {
    const stored = [nft(206, 309, 309), nft(215, 309, 309), nft(311, 303, 303)];
    const stale = stored.map((value) => ({
      ...value,
      edition_size_floor: 310,
    }));
    const result = await preserveEditionSizeFloors(fixtureDb(stored), stale);
    assert.deepEqual(
      result.map((value) => value.edition_size_floor),
      [309, 309, 303],
    );
  });

  it("preserves existing floors during historical snapshot saves and burns", async () => {
    const stored = [
      nft(215, 309, 310),
      nft(550, 190, 305),
      nft(558, 173, 310),
      nft(8, 500, 500),
    ];
    const snapshot = [
      nft(215, 200, null),
      nft(550, 185, null),
      nft(558, 100, 310),
      nft(8, 490, null),
    ];
    const result = await preserveEditionSizeFloors(fixtureDb(stored), snapshot);
    assert.deepEqual(
      result.map((value) => value.edition_size_floor),
      [309, 305, 310, 500],
    );
    assert.deepEqual(
      result.map((value) => value.edition_size),
      [200, 185, 100, 490],
    );
  });

  it("initializes missing floors from supply without overwriting incoming positive floors", async () => {
    const result = await preserveEditionSizeFloors(fixtureDb([]), [
      nft(215, 309, null),
      nft(550, 190, 305),
    ]);
    assert.deepEqual(
      result.map((value) => value.edition_size_floor),
      [309, 305],
    );
  });
});
