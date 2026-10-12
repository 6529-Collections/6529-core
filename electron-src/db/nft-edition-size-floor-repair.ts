import {
  NFTS_TABLE,
  TRANSACTIONS_BLOCKS_TABLE,
} from "../../electron-constants";
import { MEMES_CONTRACT } from "../../shared/abis/memes";
import {
  MEME_CATCH_UP_FLOOR_REPAIRS,
  MEMES_EDITION_SIZE_FLOOR_CAP,
} from "../../shared/memes-edition-size-floor";

interface QueryExecutor {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

interface RepairDatabase extends QueryExecutor {
  transaction<T>(run: (db: QueryExecutor) => Promise<T>): Promise<T>;
}

// Repeatable data maintenance, deliberately independent of core_migration.
// Empty/partial discovery and old migration markers cannot consume the repair.
export async function repairNftEditionSizeFloors(db: RepairDatabase) {
  const badFloor = `LOWER(contract) = ? AND id IN (${MEME_CATCH_UP_FLOOR_REPAIRS.map(() => "?").join(", ")}) AND edition_size_floor = ?`;
  const missingFloor =
    "(edition_size_floor IS NULL OR edition_size_floor <= 0) AND edition_size > 0";
  const badFloorParameters = [
    MEMES_CONTRACT.toLowerCase(),
    ...MEME_CATCH_UP_FLOOR_REPAIRS.map((repair) => repair.id),
    MEMES_EDITION_SIZE_FLOOR_CAP,
  ];
  const candidates = (await db.query(
    `SELECT 1 FROM ${NFTS_TABLE} WHERE (${badFloor}) OR (${missingFloor}) LIMIT 1`,
    badFloorParameters,
  )) as unknown[];
  if (candidates.length === 0) {
    return;
  }

  // The updates retain their predicates in case another worker repaired the
  // candidates between this read-only probe and acquiring the write lock.
  await db.transaction(async (manager) => {
    await manager.query(
      `UPDATE ${TRANSACTIONS_BLOCKS_TABLE} SET tdh_needs_recalculation = 1
       WHERE id = 1 AND EXISTS (SELECT 1 FROM ${NFTS_TABLE} WHERE (${badFloor}) OR (${missingFloor}))`,
      badFloorParameters,
    );
    for (const repair of MEME_CATCH_UP_FLOOR_REPAIRS) {
      await manager.query(
        `UPDATE ${NFTS_TABLE} SET edition_size_floor = ?
         WHERE LOWER(contract) = ? AND id = ? AND edition_size_floor = ?`,
        [
          repair.floor,
          MEMES_CONTRACT.toLowerCase(),
          repair.id,
          MEMES_EDITION_SIZE_FLOOR_CAP,
        ],
      );
    }
    await manager.query(
      `UPDATE ${NFTS_TABLE} SET edition_size_floor = edition_size WHERE ${missingFloor}`,
    );
  });
}
