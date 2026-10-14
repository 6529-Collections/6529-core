import "reflect-metadata";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DataSource } from "typeorm";
import {
  Consolidation,
  Delegation,
  EventType,
  NFTDelegationBlock,
  NFTDelegationReplayBlock,
  ReplayConsolidation,
  ReplayDelegation,
  NativeDelegationRegistration,
  ReplayNativeDelegationRegistration,
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
import {
  getPendingDelegationGroups,
  getStagedDelegationRegistrations,
  persistReconciledDelegationGroup,
  prepareNativeDelegationReplay,
} from "./staged-delegation-sync.db";
import { syncNativeDelegations } from "./delegation-sync";
import { DelegationStateReader } from "./delegation-registration-expiry";
import { retryReplayTransaction } from "./replay-transaction";
import {
  DELEGATION_CONTRACT,
  NATIVE_DELEGATION_INDEX_VERSION,
} from "../../../../electron-constants";

async function resolveFixtureGroups(db: DataSource, block: number) {
  for (const group of await getPendingDelegationGroups(db)) {
    const registrations = await getStagedDelegationRegistrations(db, group);
    await persistReconciledDelegationGroup(
      db,
      block,
      registrations.map((r) => ({ ...r, expiry: 1234 })),
    );
  }
}
async function completeFixtureReplay(db: DataSource, block: number) {
  const checkpoint = await db
    .getRepository(NFTDelegationReplayBlock)
    .findOneByOrFail({ id: 1 });
  if (checkpoint.block === block) await resolveFixtureGroups(db, block);
  await completeNativeDelegationReplay(db, block);
}

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
  private database;
  constructor(path = ":memory:") {
    this.database = new DatabaseSync(path);
  }
  prepare(sql: string) {
    const statement = this.database.prepare(sql);
    return {
      reader: statement.columns().length > 0,
      all: (...args: unknown[]) =>
        statement.all(...args).map((row) => ({ ...(row as object) })),
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
  registrationLogs: [
    {
      block: 100,
      logIndex: wallet1 === "b" ? 1 : 0,
      delegator: wallet1,
      delegate: wallet2,
      collection: "memes",
      useCase: 2,
      allTokens: false,
      tokenId: BigInt(0),
      timestamp,
    },
  ],
});

describe("native delegation persistence and resumable atomic replay", () => {
  let db: DataSource;
  let temporaryDirectory: string | undefined;
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
        NativeDelegationRegistration,
        ReplayNativeDelegationRegistration,
        NFTDelegationReplayBlock,
        NativeDelegationRegistration,
        ReplayNativeDelegationRegistration,
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
    if (temporaryDirectory) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  async function openCompetingConnection() {
    const options = db.options;
    if (options.type !== "better-sqlite3") {
      throw new Error("Lock fixture requires SQLite");
    }
    await db.destroy();
    temporaryDirectory = mkdtempSync(join(tmpdir(), "core-replay-lock-"));
    const path = join(temporaryDirectory, "fixture.sqlite");
    db = await new DataSource({ ...options, database: path }).initialize();
    await db.query("PRAGMA busy_timeout = 0");
    await db
      .getRepository(TransactionBlock)
      .save({ id: 1, block: 100, timestamp: 1000 });
    const competitor = new FixtureDriver(path);
    competitor.pragma("busy_timeout = 0");
    return competitor;
  }

  it("retries a real competing writer after rollback without rereading contract state", async () => {
    const competitor = await openCompetingConnection();
    try {
      await prepareNativeDelegationReplay(db);
      await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
      competitor.prepare("BEGIN IMMEDIATE").run();
      const waits: boolean[] = [];
      let reads = 0;
      const reader: DelegationStateReader = {
        readDelegates: async () => {
          reads++;
          return ["b"];
        },
        readEntry: async () => {
          reads++;
          return {
            delegator: "a",
            delegate: "b",
            registeredAt: BigInt(1792022400),
            expiry: BigInt(1234),
            allTokens: false,
            tokenId: BigInt(0),
          };
        },
      };
      await syncNativeDelegations(
        db,
        {
          getBlockNumber: async () => 100,
          getBlock: async () => ({ hash: "100" }),
        },
        reader,
        async () => {
          throw new Error("unexpected rescan");
        },
        () => {},
        (waiting) => {
          waits.push(waiting);
          if (waiting) {
            assert.equal(db.createQueryRunner().isTransactionActive, false);
            assert.deepEqual(
              competitor
                .prepare(
                  "SELECT expiry FROM native_delegation_registrations_replay",
                )
                .all(),
              [{ expiry: null }],
            );
            competitor.prepare("ROLLBACK").run();
          }
        },
      );
      assert.deepEqual(waits, [true, false]);
      assert.equal(reads, 2);
      assert.equal(await isNativeDelegationIndexReady(db), true);
      assert.equal(
        (
          await db
            .getRepository(Delegation)
            .findOneByOrFail({ from_address: "a" })
        ).expiry,
        1234,
      );
    } finally {
      competitor.close();
    }
  });

  it("rolls back a blocked publication commit, preserving all tables before retry", async () => {
    const competitor = await openCompetingConnection();
    try {
      await prepareNativeDelegationReplay(db);
      await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
      await resolveFixtureGroups(db, 100);
      competitor.prepare("BEGIN").run();
      competitor.prepare("SELECT * FROM nft_delegation_blocks").all();
      const waits: boolean[] = [];
      await completeNativeDelegationReplay(db, 100, (waiting) => {
        waits.push(waiting);
        if (waiting) {
          assert.deepEqual(
            competitor
              .prepare("SELECT block, index_version FROM nft_delegation_blocks")
              .all(),
            [{ block: 10, index_version: 0 }],
          );
          for (const [live, staged] of [
            ["consolidations", "consolidations_replay"],
            ["delegations", "delegations_replay"],
            [
              "native_delegation_registrations",
              "native_delegation_registrations_replay",
            ],
          ]) {
            const expectedLive = live === "consolidations" ? 1 : 0;
            assert.deepEqual(
              competitor.prepare(`SELECT COUNT(*) AS n FROM ${live}`).all(),
              [{ n: expectedLive }],
            );
            assert.deepEqual(
              competitor.prepare(`SELECT COUNT(*) AS n FROM ${staged}`).all(),
              [{ n: 1 }],
            );
          }
          assert.deepEqual(
            competitor
              .prepare("SELECT block FROM nft_delegation_replay_blocks")
              .all(),
            [{ block: 100 }],
          );
          competitor.prepare("ROLLBACK").run();
        }
      });
      assert.deepEqual(waits, [true, false]);
      assert.equal(await isNativeDelegationIndexReady(db), true);
      for (const entity of [
        Consolidation,
        Delegation,
        NativeDelegationRegistration,
      ]) {
        assert.equal(await db.getRepository(entity).count(), 1);
      }
      assert.equal(await db.getRepository(NFTDelegationReplayBlock).count(), 0);
    } finally {
      competitor.close();
    }
  });

  it("bounds persistent real contention and does not retry unrelated failures", async () => {
    const competitor = await openCompetingConnection();
    try {
      competitor.prepare("BEGIN IMMEDIATE").run();
      let attempts = 0;
      const waits: boolean[] = [];
      await assert.rejects(
        retryReplayTransaction(
          db,
          (waiting) => waits.push(waiting),
          async (manager) => {
            attempts++;
            await manager
              .getRepository(NFTDelegationBlock)
              .findOneByOrFail({ id: 1 });
            await manager
              .getRepository(NFTDelegationBlock)
              .update({ id: 1 }, { block: 200 });
          },
          { maxAttempts: 3, baseDelayMs: 1 },
        ),
        /database is locked/,
      );
      assert.equal(attempts, 3);
      assert.deepEqual(waits, [true, true]);
      competitor.prepare("ROLLBACK").run();
      assert.equal(await getLatestNFTDBlock(db), 10);
      attempts = 0;
      const failure = new Error("invalid reconciliation metadata");
      await assert.rejects(
        retryReplayTransaction(db, undefined, async () => {
          attempts++;
          throw failure;
        }),
        (error) => error === failure,
      );
      assert.equal(attempts, 1);
    } finally {
      competitor.close();
    }
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
    await completeFixtureReplay(db, 101);
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
    await assert.rejects(completeFixtureReplay(db, 100), /fixture failure/);
    assert.equal(
      (await db.getRepository(Consolidation).find())[0].wallet1,
      "old",
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(await isNativeDelegationIndexReady(db), false);
    assert.equal(await db.getRepository(ReplayConsolidation).count(), 1);
    await db.query("DROP TRIGGER fail_swap");
    await completeFixtureReplay(db, 100);
    await resetNativeDelegationReplay(db);
    assert.equal(await isNativeDelegationIndexReady(db), false);
    assert.equal(
      (await db.getRepository(Consolidation).find())[0].wallet1,
      "a",
    );
  });

  it("rejects a replay target mismatch without changing live rows or progress", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 5, 100, true);
    await assert.rejects(
      completeFixtureReplay(db, 101),
      /checkpoint incomplete/,
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(await isNativeDelegationIndexReady(db), false);
    assert.equal(await db.getRepository(ReplayConsolidation).count(), 1);
  });

  it("fails safely if live and shadow column sets drift", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 5, 100, true);
    await resolveFixtureGroups(db, 100);
    for (const target of [
      ReplayConsolidation,
      ReplayDelegation,
      ReplayNativeDelegationRegistration,
    ]) {
      const metadata = db.getMetadata(target);
      const originalColumns = metadata.columns;
      const extraColumn = Object.assign(
        Object.create(
          Object.getPrototypeOf(originalColumns[0]),
        ) as (typeof originalColumns)[0],
        originalColumns[0],
        { databaseName: "unexpected_column" },
      );
      metadata.columns = [...originalColumns, extraColumn];
      try {
        await assert.rejects(
          completeFixtureReplay(db, 100),
          /replay column mismatch/,
        );
      } finally {
        metadata.columns = originalColumns;
      }
      assert.equal(
        (await db.getRepository(Consolidation).find())[0].wallet1,
        "old",
      );
      assert.equal(await getLatestNFTDBlock(db), 10);
      assert.equal(await isNativeDelegationIndexReady(db), false);
      assert.equal(await db.getRepository(ReplayConsolidation).count(), 1);
    }
    await completeFixtureReplay(db, 100);
    assert.equal(await isNativeDelegationIndexReady(db), true);
  });

  it("fresh sync and Reset work with old logs and only recent state, resuming after interruption", async () => {
    const deploy = DELEGATION_CONTRACT.deploy_block;
    const head = deploy + 1000;
    const events = scan();
    events.consolidations[0].block = deploy + 1;
    events.registrations[0].block = deploy + 1;
    events.registrationLogs[0].block = deploy + 1;
    const reads: number[] = [];
    const reader: DelegationStateReader = {
      readDelegates: async (query) => {
        reads.push(query.block);
        if (query.block < head - 64)
          throw new Error("historical state unavailable");
        return ["b"];
      },
      readEntry: async (query) => {
        reads.push(query.block);
        if (query.block < head - 64)
          throw new Error("historical state unavailable");
        return {
          delegator: "a",
          delegate: "b",
          registeredAt: BigInt(1792022400),
          expiry: BigInt(1234),
          allTokens: false,
          tokenId: BigInt(0),
        };
      },
    };
    const provider = {
      getBlockNumber: async () => head,
      getBlock: async (block: number) => ({ hash: `hash-${block}` }),
    };
    await assert.rejects(
      syncNativeDelegations(
        db,
        provider,
        reader,
        async (from) => {
          assert.equal(from, deploy);
          await persistNftDelegations(
            db,
            deploy + 20,
            2000,
            events,
            1,
            0,
            true,
          );
          throw new Error("interrupted scan");
        },
        () => {},
      ),
      /interrupted scan/,
    );
    assert.equal(reads.length, 0);
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(await db.getRepository(Consolidation).count(), 1);
    const resumed = await syncNativeDelegations(
      db,
      provider,
      reader,
      async (from, to) => {
        assert.equal(from, deploy + 21);
        await persistNftDelegations(
          db,
          to,
          3000,
          {
            consolidations: [],
            registrations: [],
            revocations: [],
            registrationLogs: [],
          },
          1,
          0,
          true,
        );
      },
      () => {},
    );
    assert.equal(resumed.upgrade, true);
    assert.deepEqual(reads, [head, head]);
    assert.equal(
      (
        await db
          .getRepository(Delegation)
          .findOneByOrFail({ from_address: "a" })
      ).expiry,
      1234,
    );
    assert.equal(
      await db.getRepository(NativeDelegationRegistration).count(),
      1,
    );
    assert.equal(await isNativeDelegationIndexReady(db), true);
    await resetNativeDelegationReplay(db);
    assert.equal(await db.getRepository(Delegation).count(), 1);
    await syncNativeDelegations(
      db,
      provider,
      reader,
      async (from, to) => {
        assert.equal(from, deploy);
        await persistNftDelegations(db, to, 3000, events, 1, 0, true);
      },
      () => {},
    );
    assert.equal(await isNativeDelegationIndexReady(db), true);
    assert.equal(await db.getRepository(Delegation).count(), 1);
  });

  it("projects the last representable same-key slot while retaining every exact ledger entry", async () => {
    const events = scan();
    const base = events.registrationLogs[0];
    const oversized = (BigInt(1) << BigInt(256)) - BigInt(1);
    events.registrationLogs = [
      { ...base, logIndex: 0, tokenId: BigInt(7) },
      { ...base, logIndex: 1, tokenId: oversized },
      { ...base, logIndex: 2, tokenId: BigInt(61) },
      { ...base, logIndex: 3, tokenId: oversized - BigInt(1) },
    ];
    await persistNftDelegations(db, 100, 2000, events, 1, 0, true);
    const [group] = await getPendingDelegationGroups(db);
    const staged = await getStagedDelegationRegistrations(db, group);
    // Reconciliation must normalize input order before projecting its legacy key.
    await persistReconciledDelegationGroup(
      db,
      100,
      staged.map((r) => ({ ...r, expiry: 1000 + r.log_index })).reverse(),
    );
    assert.equal(await db.getRepository(Delegation).count(), 0);
    await completeNativeDelegationReplay(db, 100);
    const rows = await db.getRepository(Delegation).find();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].all_tokens, false);
    assert.equal(rows[0].token_id, 61);
    assert.equal(rows[0].expiry, 1002);
    const ledger = await db.getRepository(NativeDelegationRegistration).find({
      order: { block: "ASC", log_index: "ASC" },
    });
    assert.deepEqual(
      ledger.map((r) => [r.token_id, r.expiry]),
      [
        ["7", 1000],
        [oversized.toString(), 1001],
        ["61", 1002],
        [(oversized - BigInt(1)).toString(), 1003],
      ],
    );
  });

  it("incremental sync applies same-block revoke/re-register order and keeps oversized slots aligned", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
    await completeFixtureReplay(db, 100);
    await db
      .getRepository(TransactionBlock)
      .update({ id: 1 }, { tdh_needs_recalculation: false });
    const events = scan();
    events.consolidations = [];
    const r = events.registrationLogs[0];
    events.registrationLogs = [
      { ...r, block: 101, logIndex: 0, tokenId: BigInt(1) },
      { ...r, block: 101, logIndex: 2, tokenId: BigInt(2147483648) },
      { ...r, block: 101, logIndex: 3, tokenId: BigInt(7) },
    ];
    events.revocations = [
      {
        ...events.registrations[0],
        block: 101,
        log_index: 1,
        type: EventType.REVOKE,
      },
    ];
    const provider = {
      getBlockNumber: async () => 101,
      getBlock: async () => ({ hash: "101" }),
    };
    const reader: DelegationStateReader = {
      readDelegates: async () => ["b", "b"],
      readEntry: async (_q, _delegate, index) => ({
        delegator: "a",
        delegate: "b",
        registeredAt: BigInt(r.timestamp),
        expiry: BigInt(2000 + index),
        allTokens: false,
        tokenId: index === 0 ? BigInt(2147483648) : BigInt(7),
      }),
    };
    const result = await syncNativeDelegations(
      db,
      provider,
      reader,
      async (from, to) => {
        assert.equal(from, 101);
        await persistNftDelegations(db, to, 3000, events, 1, 0, true);
      },
      () => {},
    );
    assert.equal(result.upgrade, false);
    const rows = await db.getRepository(Delegation).find();
    assert.equal(rows.length, 1);
    assert.deepEqual(
      [rows[0].block, rows[0].token_id, rows[0].all_tokens, rows[0].expiry],
      [101, 7, false, 2001],
    );
    assert.equal(
      await db.getRepository(NativeDelegationRegistration).count(),
      2,
    );
    assert.equal(
      (await db.getRepository(TransactionBlock).findOneByOrFail({ id: 1 }))
        .tdh_needs_recalculation,
      false,
    );
    // A later revocation needs no expiry lookup and removes every stored slot.
    await syncNativeDelegations(
      db,
      {
        getBlockNumber: async () => 102,
        getBlock: async () => ({ hash: "102" }),
      },
      {
        readDelegates: async () => {
          throw new Error("unexpected state read");
        },
        readEntry: reader.readEntry,
      },
      async (_from, to) => {
        await persistNftDelegations(
          db,
          to,
          4000,
          {
            consolidations: [],
            registrations: [],
            registrationLogs: [],
            revocations: [
              { ...events.revocations[0], block: 102, log_index: 0 },
            ],
          },
          1,
          0,
          true,
        );
      },
      () => {},
    );
    assert.equal(await db.getRepository(Delegation).count(), 0);
    assert.equal(
      await db.getRepository(NativeDelegationRegistration).count(),
      0,
    );
  });

  it("failed state reads and aged/reorganized snapshots preserve live data and pending reconciliation", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
    const provider = {
      getBlockNumber: async () => 100,
      getBlock: async () => ({ hash: "100" }),
    };
    const slots = {
      readDelegates: async () => ["b"],
      readEntry: async () => ({
        delegator: "a",
        delegate: "b",
        registeredAt: BigInt(1792022400),
        expiry: BigInt(1234),
        allTokens: false,
        tokenId: BigInt(0),
      }),
    };
    const noScan = async () => {
      throw new Error("unexpected rescan");
    };
    await assert.rejects(
      syncNativeDelegations(
        db,
        provider,
        {
          ...slots,
          readEntry: async () => {
            throw new Error("RPC failure");
          },
        },
        noScan,
        () => {},
      ),
      /RPC failure/,
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(
      (await db.getRepository(ReplayNativeDelegationRegistration).find())[0]
        .expiry,
      null,
    );
    let hashes = 0;
    await assert.rejects(
      syncNativeDelegations(
        db,
        { ...provider, getBlock: async () => ({ hash: String(++hashes) }) },
        slots,
        noScan,
        () => {},
      ),
      /snapshot changed/,
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    let aged = false;
    await assert.rejects(
      syncNativeDelegations(
        db,
        { ...provider, getBlockNumber: async () => (aged ? 165 : 100) },
        {
          ...slots,
          readEntry: async () => {
            aged = true;
            return slots.readEntry();
          },
        },
        noScan,
        () => {},
      ),
      /no longer recent/,
    );
    assert.equal(
      (await db.getRepository(ReplayNativeDelegationRegistration).find())[0]
        .expiry,
      null,
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    const snapshots: number[] = [];
    await syncNativeDelegations(
      db,
      { ...provider, getBlockNumber: async () => 165 },
      {
        readDelegates: async (query) => {
          snapshots.push(query.block);
          return slots.readDelegates();
        },
        readEntry: async (query) => {
          snapshots.push(query.block);
          return slots.readEntry();
        },
      },
      async (from, to) => {
        assert.deepEqual([from, to], [101, 165]);
        assert.equal(await getLatestNFTDBlock(db), 10);
        await persistNftDelegations(
          db,
          to,
          3000,
          {
            consolidations: [],
            registrations: [],
            revocations: [],
            registrationLogs: [],
          },
          1,
          0,
          true,
        );
      },
      () => {},
    );
    assert.deepEqual(snapshots, [165, 165]);
    assert.equal(await getLatestNFTDBlock(db), 165);
    assert.equal(
      (await db.getRepository(NativeDelegationRegistration).find())[0].expiry,
      1234,
    );
    assert.equal(await isNativeDelegationIndexReady(db), true);
  });

  it("catches logs up before expiry reads if a long replay exceeds the full-node window", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
    let head = 100;
    const snapshots: number[] = [];
    const provider = {
      getBlockNumber: async () => {
        const result = head;
        head = 200;
        return result;
      },
      getBlock: async () => ({ hash: "200" }),
    };
    await syncNativeDelegations(
      db,
      provider,
      {
        readDelegates: async (q) => {
          snapshots.push(q.block);
          return ["b"];
        },
        readEntry: async () => ({
          delegator: "a",
          delegate: "b",
          registeredAt: BigInt(1792022400),
          expiry: BigInt(1234),
          allTokens: false,
          tokenId: BigInt(0),
        }),
      },
      async (from, to) => {
        assert.deepEqual([from, to], [101, 200]);
        await persistNftDelegations(
          db,
          to,
          3000,
          {
            consolidations: [],
            registrations: [],
            revocations: [],
            registrationLogs: [],
          },
          1,
          0,
          true,
        );
      },
      () => {},
    );
    assert.deepEqual(snapshots, [200]);
    assert.equal(await getLatestNFTDBlock(db), 200);
  });

  for (const staleHash of [null, "stale-v1-hash"]) {
    it(`discards an older replay format with ${staleHash ?? "no hash"} while preserving live rows`, async () => {
      await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
      await db.getRepository(NFTDelegationReplayBlock).update(
        { id: 1 },
        {
          index_version: 1,
          block_hash: staleHash,
          upgrade: false,
          consolidations_changed: true,
        },
      );
      await db
        .getRepository(NFTDelegationBlock)
        .update({ id: 1 }, { index_version: 1 });
      const checkpoint = await prepareNativeDelegationReplay(db);
      assert.equal(checkpoint.block, DELEGATION_CONTRACT.deploy_block - 1);
      assert.equal(checkpoint.index_version, NATIVE_DELEGATION_INDEX_VERSION);
      assert.equal(checkpoint.block_hash, null);
      assert.equal(checkpoint.upgrade, true);
      assert.equal(checkpoint.consolidations_changed, false);
      assert.equal(checkpoint.timestamp, 0);
      assert.equal(
        await db.getRepository(ReplayNativeDelegationRegistration).count(),
        0,
      );
      assert.equal(await getLatestNFTDBlock(db), 10);
      assert.equal(await db.getRepository(Consolidation).count(), 1);
      assert.equal(await isNativeDelegationIndexReady(db), false);
    });
  }

  it("resumes expiry batches without rereading verified groups or exposing partial live rows", async () => {
    const logs = Array.from({ length: 21 }, (_, index) => ({
      block: 100,
      logIndex: index,
      delegator: `a${String(index).padStart(2, "0")}`,
      delegate: "b",
      collection: "memes",
      useCase: 2,
      allTokens: false,
      tokenId: BigInt(index),
      timestamp: 1792022400 + index,
    }));
    await persistNftDelegations(
      db,
      100,
      2000,
      {
        consolidations: [],
        registrations: [],
        revocations: [],
        registrationLogs: logs,
      },
      1,
      0,
      true,
    );
    let fail = true;
    const reads: string[] = [];
    const reader: DelegationStateReader = {
      readDelegates: async () => ["b"],
      readEntry: async (query) => {
        reads.push(query.delegator);
        if (fail && query.delegator === "a20")
          throw new Error("last batch interrupted");
        const index = Number(query.delegator.slice(1));
        return {
          delegator: query.delegator,
          delegate: "b",
          registeredAt: BigInt(1792022400 + index),
          expiry: BigInt(1234 + index),
          allTokens: false,
          tokenId: BigInt(index),
        };
      },
    };
    const provider = {
      getBlockNumber: async () => 100,
      getBlock: async () => ({ hash: "100" }),
    };
    const noScan = async () => {
      throw new Error("unexpected rescan");
    };
    const progress: [number, number][] = [];
    const recordProgress = (completed: number, total: number) => {
      progress.push([completed, total]);
    };
    await assert.rejects(
      syncNativeDelegations(db, provider, reader, noScan, recordProgress),
      /last batch interrupted/,
    );
    assert.deepEqual(progress, [
      [0, 21],
      [20, 21],
    ]);
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(await db.getRepository(Delegation).count(), 0);
    assert.equal(await db.getRepository(ReplayDelegation).count(), 20);
    fail = false;
    reads.length = 0;
    progress.length = 0;
    await syncNativeDelegations(db, provider, reader, noScan, recordProgress);
    assert.deepEqual(progress, [[20, 21]]);
    assert.deepEqual(reads, ["a20"]);
    assert.equal(await db.getRepository(Delegation).count(), 21);
    assert.equal(
      await db.getRepository(NativeDelegationRegistration).count(),
      21,
    );
    assert.equal(await isNativeDelegationIndexReady(db), true);
  });

  it("partitions pending state reads by all three tuple fields and writes canonical decimal token IDs", async () => {
    const base = scan().registrationLogs[0];
    const logs = [
      { ...base, logIndex: 0, tokenId: BigInt("0x07") },
      { ...base, logIndex: 1, tokenId: BigInt("0008") },
      { ...base, logIndex: 2, delegator: "c" },
      { ...base, logIndex: 3, collection: "other" },
      { ...base, logIndex: 4, useCase: 3 },
    ];
    await persistNftDelegations(
      db,
      100,
      2000,
      {
        consolidations: [],
        registrations: [],
        revocations: [],
        registrationLogs: logs,
      },
      1,
      0,
      true,
    );
    const groups = await getPendingDelegationGroups(db);
    assert.equal(groups.length, 4);
    let rows = 0;
    for (const group of groups) {
      const records = await getStagedDelegationRegistrations(db, group);
      rows += records.length;
      assert.ok(
        records.every(
          (r) =>
            r.from_address === group.from_address &&
            r.collection === group.collection &&
            r.use_case === group.use_case,
        ),
      );
      assert.ok(records.every((r) => /^(0|[1-9][0-9]*)$/.test(r.token_id)));
    }
    assert.equal(rows, 5);
    assert.deepEqual(
      (
        await getStagedDelegationRegistrations(db, {
          from_address: "a",
          collection: "memes",
          use_case: 2,
        })
      ).map((r) => r.token_id),
      ["7", "8"],
    );
  });

  it("a pruning failure during reconciliation reports a resumable age error and leaves live rows intact", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
    let head = 100;
    await assert.rejects(
      syncNativeDelegations(
        db,
        {
          getBlockNumber: async () => head,
          getBlock: async () => ({ hash: "100" }),
        },
        {
          readDelegates: async () => {
            head = 229;
            throw new Error("historical state unavailable");
          },
          readEntry: async () => {
            throw new Error("unexpected entry read");
          },
        },
        async () => {
          throw new Error("unexpected scan");
        },
        () => {},
      ),
      /no longer recent/,
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(
      (await db.getRepository(ReplayNativeDelegationRegistration).find())[0]
        .expiry,
      null,
    );
    assert.equal(
      (await db.getRepository(Consolidation).find())[0].wallet1,
      "old",
    );
  });

  it("resumes without Reset after missing checkpoint or snapshot blocks", async () => {
    await persistNftDelegations(
      db,
      100,
      2000,
      scan(),
      1,
      0,
      true,
      "original-hash",
    );
    const checkpoint = await db
      .getRepository(NFTDelegationReplayBlock)
      .findOneByOrFail({ id: 1 });
    const noScan = async () => {
      throw new Error("unexpected scan");
    };
    let reads = 0;
    const reader: DelegationStateReader = {
      readDelegates: async () => {
        reads++;
        return ["b"];
      },
      readEntry: async () => {
        reads++;
        return {
          delegator: "a",
          delegate: "b",
          registeredAt: BigInt(1792022400),
          expiry: BigInt(1234),
          allTokens: false,
          tokenId: BigInt(0),
        };
      },
    };
    for (const missingBlock of [null, { hash: null }]) {
      // Saved checkpoint, snapshot before reads, and snapshot after reads.
      for (const missingAt of [1, 2, 3]) {
        let blocks = 0;
        reads = 0;
        await assert.rejects(
          syncNativeDelegations(
            db,
            {
              getBlockNumber: async () => 100,
              getBlock: async () =>
                ++blocks === missingAt
                  ? missingBlock
                  : { hash: "original-hash" },
            },
            reader,
            noScan,
            () => {},
          ),
          (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(
              error.message,
              /Missing delegation .* block 100; retry/,
            );
            assert.doesNotMatch(error.message, /Reset/);
            return true;
          },
        );
        assert.equal(reads, missingAt === 3 ? 2 : 0);
        assert.equal(await getLatestNFTDBlock(db), 10);
        assert.deepEqual(
          await db
            .getRepository(NFTDelegationReplayBlock)
            .findOneByOrFail({ id: 1 }),
          checkpoint,
        );
        assert.equal(
          (await db.getRepository(ReplayNativeDelegationRegistration).find())[0]
            .expiry,
          null,
        );
      }
    }
    await syncNativeDelegations(
      db,
      {
        getBlockNumber: async () => 100,
        getBlock: async () => ({ hash: "original-hash" }),
      },
      reader,
      noScan,
      () => {},
    );
    assert.equal(await getLatestNFTDBlock(db), 100);
    assert.equal(await isNativeDelegationIndexReady(db), true);
    assert.equal(
      (await db.getRepository(NativeDelegationRegistration).find())[0].expiry,
      1234,
    );
  });

  it("rejects a changed saved checkpoint before scanning or reading state", async () => {
    await persistNftDelegations(
      db,
      100,
      2000,
      scan(),
      1,
      0,
      true,
      "original-hash",
    );
    await assert.rejects(
      syncNativeDelegations(
        db,
        {
          getBlockNumber: async () => 100,
          getBlock: async () => ({ hash: "other-fork" }),
        },
        {
          readDelegates: async () => {
            throw new Error("unexpected call");
          },
          readEntry: async () => {
            throw new Error("unexpected call");
          },
        },
        async () => {
          throw new Error("unexpected scan");
        },
        () => {},
      ),
      /checkpoint changed/,
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
    assert.equal(
      (
        await db
          .getRepository(NFTDelegationReplayBlock)
          .findOneByOrFail({ id: 1 })
      ).block_hash,
      "original-hash",
    );
  });

  it("cannot publish unresolved expiry and rolls a mismatched group back without losing slots", async () => {
    await persistNftDelegations(db, 100, 2000, scan(), 1, 0, true);
    await assert.rejects(
      completeNativeDelegationReplay(db, 100),
      /reconciliation incomplete/,
    );
    const staged = await db
      .getRepository(ReplayNativeDelegationRegistration)
      .find();
    await assert.rejects(
      persistReconciledDelegationGroup(
        db,
        100,
        staged.map((r) => ({ ...r, expiry: 1234, token_id: "99" })),
      ),
      /does not match/,
    );
    assert.equal(staged.length, 1);
    assert.equal(
      (await db.getRepository(ReplayNativeDelegationRegistration).find())[0]
        .expiry,
      null,
    );
    assert.equal(await getLatestNFTDBlock(db), 10);
  });

  it("ordinary delegation scope updates do not invalidate token holding TDH", async () => {
    const changes = scan();
    changes.consolidations = [];
    await persistNftDelegations(db, 100, 2000, changes);
    assert.equal(
      (await db.getRepository(Delegation).find())[0].all_tokens,
      false,
    );
    assert.equal(
      (await db.getRepository(TransactionBlock).findOneByOrFail({ id: 1 }))
        .tdh_needs_recalculation,
      false,
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
    assert.deepEqual(
      (
        await retrieveWalletConsolidations(db, "A", {
          activationTimestamp: Date.parse("2026-10-15T00:00:00Z") / 1000,
          maxWallets: 4,
          ungatedMaxWallets: 3,
          key: "test",
        })
      ).sort(),
      ["a", "b", "d"],
    );
    assert.deepEqual(
      await retrieveWalletConsolidations(db, "c", {
        activationTimestamp: Date.parse("2026-10-15T00:00:00Z") / 1000,
        maxWallets: 4,
        ungatedMaxWallets: 3,
        key: "test",
      }),
      ["c"],
    );
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
