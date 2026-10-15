import type { DataSource } from "typeorm";
import {
  NFTDelegationBlock,
  NFTDelegationRecoveryPoint,
  NFTDelegationReplayBlock,
  ReplayConsolidation,
  ReplayDelegation,
  ReplayNativeDelegationRegistration,
} from "../../../db/entities/IDelegation";
import { NATIVE_DELEGATION_INDEX_VERSION } from "../../../../electron-constants";
import {
  retryReplayTransaction,
  type DatabaseWaitUpdate,
} from "./replay-transaction";
import { resetNativeDelegationReplay } from "./nftdelegation-worker.db";

export const DELEGATION_CONFIRMATIONS = 16;
const MAX_RECOVERY_POINTS = 32;
export const DELEGATION_RECOVERY_CAPTURE_DISTANCE = 2048;
const tables = [
  ReplayConsolidation,
  ReplayDelegation,
  ReplayNativeDelegationRegistration,
] as const;

interface RecoveryState {
  version: 1;
  checkpoint: NFTDelegationReplayBlock;
  consolidations: ReplayConsolidation[];
  delegations: ReplayDelegation[];
  registrations: ReplayNativeDelegationRegistration[];
}

export class DelegationCheckpointChangedError extends Error {
  constructor() {
    super("Delegation log checkpoint changed");
  }
}

/** Only the scan/reconciliation owner writes these copies, before advancing. */
export async function captureDelegationRecoveryPoint(
  db: DataSource,
  checkpoint: NFTDelegationReplayBlock,
  head: number,
  onDatabaseWait?: DatabaseWaitUpdate,
) {
  if (
    !checkpoint.block_hash ||
    head - checkpoint.block > DELEGATION_RECOVERY_CAPTURE_DISTANCE
  )
    return;
  await retryReplayTransaction(db, onDatabaseWait, async (manager) => {
    const current = await manager
      .getRepository(NFTDelegationReplayBlock)
      .findOneByOrFail({ id: 1 });
    if (
      current.block !== checkpoint.block ||
      current.block_hash !== checkpoint.block_hash
    )
      throw new Error(
        "Delegation checkpoint moved while saving recovery point",
      );
    const existing = await manager
      .getRepository(NFTDelegationRecoveryPoint)
      .findOne({
        where: { block: current.block },
        select: { block_hash: true },
      });
    // Once captured, keep the original point at this height. In particular,
    // never replace evidence of an orphaned fork with a new hash.
    if (existing) {
      if (existing.block_hash !== current.block_hash)
        throw new DelegationCheckpointChangedError();
      return;
    }
    const state: RecoveryState = {
      version: 1,
      checkpoint: current,
      consolidations: await manager.getRepository(ReplayConsolidation).find(),
      delegations: await manager.getRepository(ReplayDelegation).find(),
      registrations: await manager
        .getRepository(ReplayNativeDelegationRegistration)
        .find(),
    };
    const repo = manager.getRepository(NFTDelegationRecoveryPoint);
    await repo.save({
      block: current.block,
      block_hash: current.block_hash!,
      state: JSON.stringify(state),
    });
    const retained = await repo.find({
      order: { block: "DESC" },
      take: MAX_RECOVERY_POINTS,
      select: { block: true },
    });
    const oldest = retained.at(-1)!;
    await repo
      .createQueryBuilder()
      .delete()
      .where("block < :block", { block: oldest.block })
      .execute();
  });
}

/** Restore complete pre-fork state; never splice or relabel an orphaned hash. */
export async function recoverDelegationCheckpoint(
  db: DataSource,
  provider: {
    getBlock(block: number): Promise<{ hash: string | null } | null>;
  },
  onDatabaseWait?: DatabaseWaitUpdate,
): Promise<number | null> {
  const checkpoint = await db
    .getRepository(NFTDelegationReplayBlock)
    .findOneByOrFail({ id: 1 });
  const changed = await provider.getBlock(checkpoint.block);
  if (!changed?.hash || changed.hash === checkpoint.block_hash)
    throw new Error(
      "Delegation RPC checkpoint is unavailable or inconsistent; retry to verify recovery",
    );
  const points = await db
    .getRepository(NFTDelegationRecoveryPoint)
    .find({ order: { block: "DESC" }, take: MAX_RECOVERY_POINTS });
  for (const point of points) {
    const block = await provider.getBlock(point.block);
    if (!block?.hash)
      throw new Error(
        `Missing delegation recovery block ${point.block}; retry to resume recovery`,
      );
    if (block.hash !== point.block_hash) continue;
    const state = JSON.parse(point.state) as RecoveryState;
    if (
      state.version !== 1 ||
      state.checkpoint.block !== point.block ||
      state.checkpoint.block_hash !== point.block_hash ||
      state.checkpoint.index_version !== NATIVE_DELEGATION_INDEX_VERSION ||
      !Array.isArray(state.consolidations) ||
      !Array.isArray(state.delegations) ||
      !Array.isArray(state.registrations)
    )
      throw new Error(
        "Invalid delegation recovery point; refusing unverified recovery",
      );
    // Verify again immediately before mutation. Missing data is retryable,
    // and a changing provider must not cause a destructive fallback rebuild.
    if ((await provider.getBlock(point.block))?.hash !== point.block_hash)
      throw new Error(
        "Delegation recovery block changed; retry to resume recovery",
      );
    await retryReplayTransaction(db, onDatabaseWait, async (manager) => {
      const current = await manager
        .getRepository(NFTDelegationReplayBlock)
        .findOneByOrFail({ id: 1 });
      if (
        current.block !== checkpoint.block ||
        current.block_hash !== checkpoint.block_hash
      )
        throw new Error(
          "Delegation checkpoint moved during recovery; retry to verify recovery",
        );
      for (const table of tables) await manager.getRepository(table).clear();
      if (state.consolidations.length)
        await manager
          .getRepository(ReplayConsolidation)
          .save(state.consolidations, { chunk: 500 });
      if (state.delegations.length)
        await manager
          .getRepository(ReplayDelegation)
          .save(state.delegations, { chunk: 500 });
      if (state.registrations.length)
        await manager
          .getRepository(ReplayNativeDelegationRegistration)
          .save(state.registrations, { chunk: 500 });
      await manager
        .getRepository(NFTDelegationReplayBlock)
        .save({ ...state.checkpoint, upgrade: true });
      // Keep the old live rows, but don't let TDH consume the suspect index.
      await manager
        .getRepository(NFTDelegationBlock)
        .update({ id: 1 }, { index_version: 0 });
      await manager
        .getRepository(NFTDelegationRecoveryPoint)
        .createQueryBuilder()
        .delete()
        .where("block > :block", { block: point.block })
        .execute();
    });
    return point.block;
  }
  // Older builds saved no undo state. A hash replacement would silently trust
  // orphaned revocations. Rebuild shadow history automatically, preserving live
  // rows and all other app data until canonical replacement is fully verified.
  if ((await provider.getBlock(checkpoint.block))?.hash !== changed.hash)
    throw new Error(
      "Delegation RPC checkpoint changed during recovery; retry to verify recovery",
    );
  await resetNativeDelegationReplay(db);
  return null;
}
