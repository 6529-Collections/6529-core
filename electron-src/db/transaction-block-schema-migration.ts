import { TRANSACTIONS_BLOCKS_TABLE } from "../../electron-constants";

interface SqliteQueryExecutor {
  query(sql: string): Promise<unknown>;
}

interface SqliteTableColumn {
  name: string;
}

const RECOVERY_COLUMNS = [
  {
    name: "tdh_run_incomplete",
    definition: "boolean NOT NULL DEFAULT (0)",
  },
  { name: "reconciliation_from_block", definition: "integer" },
  { name: "reconciliation_next_block", definition: "integer" },
  { name: "reconciliation_checkpoint_block", definition: "integer" },
] as const;

export async function ensureTransactionBlockRecoveryColumns(
  dataSource: SqliteQueryExecutor,
) {
  const columns = (await dataSource.query(
    `PRAGMA table_info("${TRANSACTIONS_BLOCKS_TABLE}")`,
  )) as SqliteTableColumn[];
  if (columns.length === 0) {
    throw new Error(
      `Unable to migrate missing ${TRANSACTIONS_BLOCKS_TABLE} table`,
    );
  }

  const existingColumns = new Set(columns.map(({ name }) => name));
  for (const column of RECOVERY_COLUMNS) {
    if (!existingColumns.has(column.name)) {
      await dataSource.query(
        `ALTER TABLE "${TRANSACTIONS_BLOCKS_TABLE}" ADD COLUMN "${column.name}" ${column.definition}`,
      );
    }
  }
}
