import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { DataSource } from "typeorm";
import {
  Consolidation,
  Delegation,
  EventType,
  NFTDelegationBlock,
  NFTDelegationReplayBlock,
  ReplayConsolidation,
  ReplayDelegation,
} from "../../../db/entities/IDelegation";
import { TransactionBlock } from "../../../db/entities/ITransaction";
import { ConsolidatedTDH } from "../../../db/entities/ITDH";
import {
  completeNativeDelegationReplay,
  getLatestNFTDBlock,
  isNativeDelegationIndexReady,
  persistNftDelegations,
  resetNativeDelegationReplay,
} from "./nftdelegation-worker.db";
import {
  expandAffectedConsolidationWallets,
  retrieveWalletConsolidations,
} from "../tdh-worker/tdh-worker.db";
import { NativeDelegationScan } from "./delegation-logs";

// Exercise real TypeORM repositories and SQLite transactions without rebuilding
// the app's better-sqlite3 binary (which is compiled for Electron's Node ABI).
interface Statement {
  columns(): unknown[];
  all(...parameters: unknown[]): unknown[];
  run(...parameters: unknown[]): { changes: number; lastInsertRowid: number };
}
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (path: string) => {
    prepare(sql: string): Statement;
    close(): void;
  };
};
class FixtureDriver {
  private database = new DatabaseSync(":memory:");
  prepare(sql: string) {
    const statement = this.database.prepare(sql);
    return {
      reader: statement.columns().length > 0,
      all: (...args: unknown[]) => statement.all(...args),
      run: (...args: unknown[]) => statement.run(...args),
    };
  }
  pragma(sql: string) {
    return this.database.prepare(`PRAGMA ${sql}`).all();
  }
  close() {
    this.database.close();
  }
}
const scan = (
  wallet1 = "a",
  wallet2 = "b",
  timestamp = 1792022400,
): NativeDelegationScan => ({
  consolidations: [
    { wallet1, wallet2, block: 100, timestamp, type: EventType.REGISTER },
  ],
  registrations: [
    {
      wallet1,
      wallet2,
      block: 100,
      type: EventType.REGISTER,
      collection: "memes",
      use_case: 2,
      all_tokens: false,
      token_id: 0,
      expiry: 1234,
    },
  ],
  revocations: [],
});

describe("native delegation persistence and resumable atomic replay", () => {
  let db: DataSource;
  beforeEach(async () => {
    db = new DataSource({
      type: "better-sqlite3",
      database: ":memory:",
      driver: FixtureDriver,
      synchronize: true,
      // Start with pre-upgrade tables: schema sync must preserve the legacy
      // pair/checkpoint while adding nullable times and a default-zero version.
      prepareDatabase: (connection: FixtureDriver) => {
        connection
          .prepare(
            "CREATE TABLE consolidations (created_at datetime NOT NULL DEFAULT (datetime('now')), block integer NOT NULL, wallet1 varchar(50) NOT NULL, wallet2 varchar(50) NOT NULL, confirmed boolean NOT NULL DEFAULT (0), PRIMARY KEY(wallet1, wallet2))",
          )
          .run();
        connection
          .prepare(
            "INSERT INTO consolidations (block, wallet1, wallet2, confirmed) VALUES (10, 'old', 'legacy', 1)",
          )
          .run();
        connection
          .prepare(
            "CREATE TABLE nft_delegation_blocks (id integer PRIMARY KEY NOT NULL, block integer NOT NULL, timestamp bigint NOT NULL)",
          )
          .run();
        connection
          .prepare("INSERT INTO nft_delegation_blocks VALUES (1, 10, 10)")
          .run();
      },
      entities: [
        Consolidation,
        Delegation,
        NFTDelegationBlock,
        ReplayConsolidation,
        ReplayDelegation,
        NFTDelegationReplayBlock,
        TransactionBlock,
        ConsolidatedTDH,
      ],
    });
    await db.initialize();
    await db
      .getRepository(TransactionBlock)
      .save({ id: 1, block: 100, timestamp: 1000 });
  });
  afterEach(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it("preserves legacy rows during chunks, resumes by checkpoint, then replaces atomically", async () => {
    assert.equal(await isNativeDelegationIndexReady(db), false);
    const legacy = await db
      .getRepository(Consolidation)
      .findOneByOrFail({ wallet1: "old" });
    assert.equal(legacy.wallet1_registered_at, null);
    await persistNftDelegations(db, 100, 2000, scan(), 5, 100, true);
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(await db.getRepository(Consolidation).count(), 1);
    assert.equal(
      (
        await db
          .getRepository(NFTDelegationReplayBlock)
          .findOneByOrFail({ id: 1 })
      ).block,
      100,
    );
    await persistNftDelegations(
      db,
      101,
      2100,
      scan("b", "a", 1792022401),
      5,
      100,
      true,
    );
    await completeNativeDelegationReplay(db, 101);
    assert.equal(await isNativeDelegationIndexReady(db), true);
    assert.equal(await getLatestNFTDBlock(db), 101);
    assert.equal(await db.getRepository(NFTDelegationReplayBlock).count(), 0);
    const link = await db
      .getRepository(Consolidation)
      .findOneByOrFail({ wallet1: "a" });
    assert.equal(link.confirmed, true);
    assert.deepEqual(
      [link.wallet1_registered_at, link.wallet2_registered_at],
      [1792022400, 1792022401],
    );
    const delegation = await db
      .getRepository(Delegation)
      .findOneByOrFail({ from_address: "a" });
    assert.deepEqual(
      [delegation.all_tokens, delegation.token_id, delegation.expiry],
      [false, 0, 1234],
    );
    assert.equal(
      (await db.getRepository(TransactionBlock).findOneByOrFail({ id: 1 }))
        .tdh_needs_recalculation,
      true,
    );
  });

  it("rolls back an incomplete chunk and never advances its checkpoint", async () => {
    const invalid = scan();
    invalid.consolidations.push({
      wallet1: "c",
      wallet2: "d",
      block: 100,
      type: EventType.REGISTER,
    });
    await assert.rejects(
      persistNftDelegations(db, 100, 2000, invalid, 1, 0, true),
      /Missing consolidation/,
    );
    assert.equal(await db.getRepository(ReplayConsolidation).count(), 0);
    assert.equal(await db.getRepository(NFTDelegationReplayBlock).count(), 0);
    assert.equal(await db.getRepository(Consolidation).count(), 1);
  });

  it("rolls back the live swap on failure and keeps the replay resumable", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 5, 100, true);
    await db.query(
      "CREATE TRIGGER fail_swap BEFORE INSERT ON delegations BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
    );
    await assert.rejects(
      completeNativeDelegationReplay(db, 100),
      /fixture failure/,
    );
    assert.equal(
      (await db.getRepository(Consolidation).find())[0].wallet1,
      "old",
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(await isNativeDelegationIndexReady(db), false);
    assert.equal(await db.getRepository(ReplayConsolidation).count(), 1);
    await db.query("DROP TRIGGER fail_swap");
    await completeNativeDelegationReplay(db, 100);
    await resetNativeDelegationReplay(db);
    assert.equal(await isNativeDelegationIndexReady(db), false);
    assert.equal(
      (await db.getRepository(Consolidation).find())[0].wallet1,
      "a",
    );
  });

  it("SQL preserves registration times and partial recalculation closes over old/current groups", async () => {
    await db.getRepository(Consolidation).clear();
    const pairs = [
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
      ["a", "d"],
      ["b", "d"],
    ];
    for (const [wallet1, wallet2] of pairs) {
      await db.getRepository(Consolidation).save({
        wallet1,
        wallet2,
        block: wallet2 === "d" ? 200 : 100,
        confirmed: true,
        wallet1_registered_at: 1792022400,
        wallet2_registered_at: 1792022400,
      });
    }
    assert.deepEqual((await retrieveWalletConsolidations(db, "A")).sort(), [
      "a",
      "b",
      "d",
    ]);
    assert.deepEqual(await retrieveWalletConsolidations(db, "c"), ["c"]);
    // Only the wallet list is needed; raw SQL avoids inventing unrelated TDH fields.
    await db.query(
      "INSERT INTO tdh_consolidation (consolidation_key, wallets, balance, unique_memes, memes_cards_sets, tdh, boost, boosted_tdh, tdh__raw, tdh_rank, date, tdh_rank_memes, tdh_rank_gradients, tdh_rank_nextgen, genesis, nakamoto, boosted_memes_tdh, memes_tdh, memes_tdh__raw, memes_balance, boosted_gradients_tdh, gradients_tdh, gradients_tdh__raw, gradients_balance, boosted_nextgen_tdh, nextgen_tdh, nextgen_tdh__raw, nextgen_balance, block) VALUES ('c-e', '[\"c\",\"e\"]', 0,0,0,0,0,0,0,0, CURRENT_TIMESTAMP,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,100)",
    );
    assert.deepEqual(await expandAffectedConsolidationWallets(db, ["D"]), [
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
  });
});
