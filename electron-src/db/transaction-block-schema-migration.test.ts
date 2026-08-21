import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ensureTransactionBlockRecoveryColumns } from "./transaction-block-schema-migration";

interface NodeSqliteDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    all(): unknown[];
    get(): unknown;
  };
}

const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => NodeSqliteDatabase;
};

describe("transaction block recovery schema migration", () => {
  let database: NodeSqliteDatabase | null = null;

  afterEach(() => {
    database?.close();
  });

  it("upgrades an existing transaction block row without losing data", async () => {
    database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE "transactions_blocks" (
        "id" integer PRIMARY KEY NOT NULL,
        "block" integer NOT NULL,
        "timestamp" bigint NOT NULL,
        "tdh_needs_recalculation" boolean NOT NULL DEFAULT (0)
      )
    `);
    database.exec(
      'INSERT INTO "transactions_blocks" ("id", "block", "timestamp") VALUES (1, 123, 456)',
    );
    const queryExecutor = {
      query: async (sql: string) => {
        if (sql.trimStart().startsWith("ALTER TABLE")) {
          database!.exec(sql);
          return [];
        }
        return database!.prepare(sql).all();
      },
    };

    await ensureTransactionBlockRecoveryColumns(queryExecutor);
    await ensureTransactionBlockRecoveryColumns(queryExecutor);

    const row = database
      .prepare('SELECT * FROM "transactions_blocks" WHERE "id" = 1')
      .get() as Record<string, number | null>;
    assert.equal(row.block, 123);
    assert.equal(row.timestamp, 456);
    assert.equal(row.tdh_run_incomplete, 0);
    assert.equal(row.reconciliation_from_block, null);
    assert.equal(row.reconciliation_next_block, null);
    assert.equal(row.reconciliation_checkpoint_block, null);
  });
});
