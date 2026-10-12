import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { MEMES_CONTRACT } from "../../shared/abis/memes";
import { GRADIENT_CONTRACT } from "../../shared/abis/gradient";
import { getCalculationEditionSize } from "../../shared/memes-edition-size-floor";
import { repairNftEditionSizeFloors } from "./nft-edition-size-floor-repair";

interface FixtureDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    run(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
  };
}
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => FixtureDatabase;
};

describe("repeatable NFT floor repair with isolated SQLite fixtures", () => {
  let database: FixtureDatabase;
  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE nfts (contract TEXT, id INTEGER, edition_size INTEGER,
        edition_size_floor INTEGER, burns INTEGER DEFAULT 0, PRIMARY KEY (contract, id));
      CREATE TABLE transactions_blocks (id INTEGER PRIMARY KEY, tdh_needs_recalculation INTEGER);
      INSERT INTO transactions_blocks VALUES (1, 0);
      CREATE TABLE core_migration (migration_name TEXT);
    `);
  });
  afterEach(() => database.close());

  const queryExecutor = {
    query: async (sql: string, parameters: unknown[] = []) =>
      database.prepare(sql).run(...parameters),
  };
  const db = {
    transaction: async <T>(
      run: (manager: typeof queryExecutor) => Promise<T>,
    ) => {
      database.exec("BEGIN");
      try {
        const result = await run(queryExecutor);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  function insert(
    id: number,
    supply: number,
    floor: number | null,
    burns = 0,
    contract = MEMES_CONTRACT,
  ) {
    database
      .prepare("INSERT INTO nfts VALUES (?, ?, ?, ?, ?)")
      .run(contract, id, supply, floor, burns);
  }
  function floor(id: number, contract = MEMES_CONTRACT): number | null {
    const rows = database
      .prepare(
        "SELECT edition_size_floor FROM nfts WHERE id = ? AND contract = ?",
      )
      .all(id, contract) as { edition_size_floor: number | null }[];
    return rows[0].edition_size_floor;
  }
  function needsRecalculation() {
    const rows = database
      .prepare(
        "SELECT tdh_needs_recalculation FROM transactions_blocks WHERE id = 1",
      )
      .all() as { tdh_needs_recalculation: number }[];
    return rows[0].tdh_needs_recalculation;
  }

  it("does not consume a repair on an empty fresh install", async () => {
    await repairNftEditionSizeFloors(db);
    assert.equal(needsRecalculation(), 0);
    insert(215, 309, 310);
    await repairNftEditionSizeFloors(db);
    assert.equal(floor(215), 309);
    assert.equal(needsRecalculation(), 1);
  });

  it("repairs cards discovered after a partial-sync restart with the old marker", async () => {
    insert(206, 309, 310);
    await repairNftEditionSizeFloors(db);
    database.exec(
      "INSERT INTO core_migration VALUES ('nftEditionSizeFloorLatestMemeRepair')",
    );
    await repairNftEditionSizeFloors(db);
    insert(215, 309, 310);
    insert(311, 303, 310);
    await repairNftEditionSizeFloors(db);
    assert.deepEqual([floor(206), floor(215), floor(311)], [309, 309, 303]);
    assert.equal(
      database.prepare("SELECT * FROM core_migration").all().length,
      1,
    );
  });

  it("repairs before TDH while retaining historical and burned-card denominators", async () => {
    insert(206, 309, 310);
    insert(215, 309, 310);
    insert(311, 303, 310);
    insert(558, 173, 310); // Active mint floor must stay above supply.
    insert(550, 190, 305, 5); // Legitimate preserved floor on a closed mint.
    insert(8, 500, 500, 10); // Core's Meme #8 adjustment stays untouched.
    insert(1, 101, null, 0, GRADIENT_CONTRACT);
    insert(215, 280, 310, 0, GRADIENT_CONTRACT);
    await repairNftEditionSizeFloors(db);
    const rows = database
      .prepare("SELECT * FROM nfts ORDER BY contract, id")
      .all();
    await repairNftEditionSizeFloors(db);
    assert.deepEqual(
      database.prepare("SELECT * FROM nfts ORDER BY contract, id").all(),
      rows,
    );
    assert.deepEqual([floor(206), floor(215), floor(311)], [309, 309, 303]);
    assert.equal(floor(558), 310);
    assert.equal(floor(550), 305);
    assert.equal(floor(8), 500);
    assert.equal(floor(1, GRADIENT_CONTRACT), 101);
    assert.equal(floor(215, GRADIENT_CONTRACT), 310);
    // Historical owner supply and later burns do not replace the persisted
    // denominator with a snapshot's smaller supply.
    assert.equal(
      getCalculationEditionSize({
        actualSupply: 200,
        editionSizeFloor: floor(215),
      }),
      309,
    );
    assert.equal(
      getCalculationEditionSize({
        actualSupply: 185,
        editionSizeFloor: floor(550),
      }),
      305,
    );
    database.exec("UPDATE transactions_blocks SET tdh_needs_recalculation = 0");
    await repairNftEditionSizeFloors(db);
    assert.equal(needsRecalculation(), 0);
  });
});
