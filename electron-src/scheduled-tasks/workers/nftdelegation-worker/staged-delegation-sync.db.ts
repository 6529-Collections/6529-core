import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from "typeorm";
import {
  Consolidation,
  Delegation,
  EventType,
  NativeDelegationRegistration,
  NFTDelegationBlock,
  NFTDelegationReplayBlock,
  ReplayConsolidation,
  ReplayDelegation,
  ReplayNativeDelegationRegistration,
} from "../../../db/entities/IDelegation";
import {
  DELEGATION_CONTRACT,
  NATIVE_DELEGATION_INDEX_VERSION,
} from "../../../../electron-constants";
import type { NativeDelegationScan } from "./delegation-logs";
import {
  MAX_STORABLE_DELEGATION_TOKEN_ID,
  writeDelegations,
} from "./delegation-row";
import { mapInChunks } from "./map-in-chunks";
import {
  retryReplayTransaction,
  type DatabaseWaitUpdate,
} from "./replay-transaction";

/** Resume version-2 staging, or rebuild only shadow state after an older replay. */
export async function prepareNativeDelegationReplay(
  db: DataSource,
): Promise<NFTDelegationReplayBlock> {
  return db.transaction(async (manager) => {
    const checkpoint = await manager
      .getRepository(NFTDelegationReplayBlock)
      .findOneBy({ id: 1 });
    if (checkpoint?.index_version === NATIVE_DELEGATION_INDEX_VERSION)
      return checkpoint;
    const live = await manager
      .getRepository(NFTDelegationBlock)
      .findOneBy({ id: 1 });
    const upgrade = live?.index_version !== NATIVE_DELEGATION_INDEX_VERSION;
    for (const [source, target] of [
      [Consolidation, ReplayConsolidation],
      [Delegation, ReplayDelegation],
      [NativeDelegationRegistration, ReplayNativeDelegationRegistration],
    ]) {
      if (upgrade) await manager.getRepository(target).clear();
      else await replaceIndexTable(manager, target, source);
    }
    return manager.getRepository(NFTDelegationReplayBlock).save({
      id: 1,
      block: upgrade ? DELEGATION_CONTRACT.deploy_block - 1 : live!.block,
      timestamp: upgrade ? 0 : live!.timestamp,
      index_version: NATIVE_DELEGATION_INDEX_VERSION,
      upgrade,
      consolidations_changed: false,
      block_hash: upgrade ? null : live!.block_hash,
    });
  });
}

/** Match the contract's append/delete storage rules in exact block/log order. */
export async function writeStagedDelegationEvents(
  manager: EntityManager,
  scan: NativeDelegationScan,
) {
  const registrations = scan.registrationLogs.map((ref) => ({
    block: ref.block,
    log_index: ref.logIndex,
    from_address: ref.delegator,
    to_address: ref.delegate,
    collection: ref.collection,
    use_case: ref.useCase,
    registered_at: ref.timestamp,
    all_tokens: ref.allTokens,
    token_id: ref.tokenId.toString(),
    expiry: null,
  }));
  const changes = [
    ...registrations.map((row) => ({ row, type: EventType.REGISTER })),
    ...scan.revocations.map((event) => ({
      row: {
        block: event.block,
        log_index: event.log_index!,
        from_address: event.wallet1,
        to_address: event.wallet2,
        collection: event.collection,
        use_case: event.use_case,
      },
      type: EventType.REVOKE,
    })),
  ].sort(
    (a, b) => a.row.block - b.row.block || a.row.log_index - b.row.log_index,
  );
  await mapInChunks(changes, 1, async ({ row, type }) => {
    if (!Number.isSafeInteger(row.log_index) || row.log_index < 0)
      throw new Error("Missing delegation log index");
    if (type === EventType.REGISTER) {
      const registration = row as (typeof registrations)[number];
      if (
        !Number.isSafeInteger(registration.registered_at) ||
        registration.registered_at <= 0
      )
        throw new Error("Missing delegation registration timestamp");
      await manager
        .getRepository(ReplayNativeDelegationRegistration)
        .save(registration);
    } else {
      const key = {
        from_address: row.from_address,
        to_address: row.to_address,
        collection: row.collection,
        use_case: row.use_case,
      };
      await manager
        .getRepository(ReplayNativeDelegationRegistration)
        .delete(key);
      await manager.getRepository(ReplayDelegation).delete(key);
    }
  });
}

export interface PendingDelegationGroup {
  from_address: string;
  collection: string;
  use_case: number;
}

/** Bound group count; per-read age guards still protect large or slow groups. */
export async function getPendingDelegationGroups(
  db: DataSource,
): Promise<PendingDelegationGroup[]> {
  return db
    .getRepository(ReplayNativeDelegationRegistration)
    .createQueryBuilder("r")
    .select("r.from_address", "from_address")
    .addSelect("r.collection", "collection")
    .addSelect("r.use_case", "use_case")
    .where("r.expiry IS NULL")
    .groupBy("r.from_address")
    .addGroupBy("r.collection")
    .addGroupBy("r.use_case")
    .orderBy("r.from_address", "ASC")
    .addOrderBy("r.collection", "ASC")
    .addOrderBy("r.use_case", "ASC")
    .limit(20)
    .getRawMany<PendingDelegationGroup>();
}

export async function getStagedDelegationRegistrations(
  db: DataSource,
  group: PendingDelegationGroup,
) {
  return db.getRepository(ReplayNativeDelegationRegistration).find({
    where: group,
    order: { block: "ASC", log_index: "ASC" },
  });
}

/** Save only a fully matched group. Public rows retain the existing key shape. */
export async function persistReconciledDelegationGroup(
  db: DataSource,
  snapshotBlock: number,
  registrations: NativeDelegationRegistration[],
  onDatabaseWait?: DatabaseWaitUpdate,
) {
  if (!registrations.length) return;
  await retryReplayTransaction(db, onDatabaseWait, async (manager) => {
    const checkpoint = await manager
      .getRepository(NFTDelegationReplayBlock)
      .findOneByOrFail({ id: 1 });
    if (
      checkpoint.block !== snapshotBlock ||
      checkpoint.index_version !== NATIVE_DELEGATION_INDEX_VERSION
    )
      throw new Error(
        "Delegation state snapshot does not match log checkpoint",
      );
    const first = registrations[0];
    const group = {
      from_address: first.from_address,
      collection: first.collection,
      use_case: first.use_case,
    };
    const repo = manager.getRepository(ReplayNativeDelegationRegistration);
    const existing = await repo.find({
      where: group,
      order: { block: "ASC", log_index: "ASC" },
    });
    const ordered = registrations
      .slice()
      .sort((a, b) => a.block - b.block || a.log_index - b.log_index);
    if (
      existing.length !== ordered.length ||
      ordered.some(
        (r, i) =>
          r.expiry === null ||
          r.from_address !== group.from_address ||
          r.collection !== group.collection ||
          r.use_case !== group.use_case ||
          r.block !== existing[i].block ||
          r.log_index !== existing[i].log_index ||
          r.to_address !== existing[i].to_address ||
          r.registered_at !== existing[i].registered_at ||
          r.all_tokens !== existing[i].all_tokens ||
          r.token_id !== existing[i].token_id,
      )
    )
      throw new Error(
        "Reconciled delegation group does not match staged registrations",
      );
    await repo.save(ordered, { chunk: 500 });
    await manager.getRepository(ReplayDelegation).delete(group);
    const emitted = ordered
      .filter((r) => BigInt(r.token_id) <= MAX_STORABLE_DELEGATION_TOKEN_ID)
      .map((r) => ({
        block: r.block,
        log_index: r.log_index,
        wallet1: r.from_address,
        wallet2: r.to_address,
        collection: r.collection,
        use_case: r.use_case,
        type: EventType.REGISTER,
        all_tokens: r.all_tokens,
        token_id: Number(r.token_id),
        expiry: r.expiry!,
      }));
    await writeDelegations(
      manager.getRepository(ReplayDelegation),
      undefined,
      emitted,
      [],
    );
  });
}

/** Copy exact shared columns; rollback protects live and staging state on drift. */
export async function replaceIndexTable(
  manager: EntityManager,
  target: EntityTarget<ObjectLiteral>,
  source: EntityTarget<ObjectLiteral>,
) {
  const to = manager.connection.getMetadata(target),
    from = manager.connection.getMetadata(source);
  const sourceColumns = new Set(
    from.columns.map((column) => column.databaseName),
  );
  if (
    sourceColumns.size !== to.columns.length ||
    !to.columns.every((column) => sourceColumns.has(column.databaseName))
  ) {
    throw new Error(
      `Delegation replay column mismatch: ${to.tableName} / ${from.tableName}`,
    );
  }
  const columns = to.columns
    .map((column) => `"${column.databaseName}"`)
    .join(", ");
  await manager.query(`DELETE FROM "${to.tableName}"`);
  await manager.query(
    `INSERT INTO "${to.tableName}" (${columns}) SELECT ${columns} FROM "${from.tableName}"`,
  );
}
