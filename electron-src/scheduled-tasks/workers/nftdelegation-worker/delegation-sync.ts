import { DataSource } from "typeorm";
import {
  NFTDelegationReplayBlock,
  ReplayNativeDelegationRegistration,
} from "../../../db/entities/IDelegation";
import {
  assertRecentDelegationSnapshot,
  DelegationStateReader,
  reconcileRegistrationExpiries,
  guardRecentDelegationReader,
} from "./delegation-registration-expiry";
import {
  getPendingDelegationGroups,
  getStagedDelegationRegistrations,
  persistReconciledDelegationGroup,
  prepareNativeDelegationReplay,
} from "./staged-delegation-sync.db";
import { completeNativeDelegationReplay } from "./nftdelegation-worker.db";
import { mapInChunks } from "./map-in-chunks";
import type { DatabaseWaitUpdate } from "./replay-transaction";
import {
  captureDelegationRecoveryPoint,
  DELEGATION_CONFIRMATIONS,
  DelegationCheckpointChangedError,
  recoverDelegationCheckpoint,
} from "./delegation-recovery";

interface RecentStateProvider {
  getBlockNumber(): Promise<number>;
  getBlock(block: number): Promise<{ hash: string | null } | null>;
}

/** Never extend durable history from an orphaned checkpoint. */
export async function verifyDelegationCheckpoint(
  provider: Pick<RecentStateProvider, "getBlock">,
  checkpoint: Pick<NFTDelegationReplayBlock, "block" | "block_hash">,
): Promise<void> {
  if (!checkpoint.block_hash) return;
  const block = await provider.getBlock(checkpoint.block);
  if (!block?.hash)
    throw new Error(
      `Missing delegation checkpoint block ${checkpoint.block}; retry to resume reconciliation`,
    );
  if (block.hash !== checkpoint.block_hash)
    throw new DelegationCheckpointChangedError();
}

/** Scan durable history, then reconcile bounded batches inside the state window. */
export async function syncNativeDelegations(
  db: DataSource,
  provider: RecentStateProvider,
  reader: DelegationStateReader,
  scan: (fromBlock: number, toBlock: number) => Promise<void>,
  progress: (completed: number, total: number) => void,
  onDatabaseWait?: DatabaseWaitUpdate,
  options: { confirmationDepth?: number } = {},
): Promise<{ block: number; upgrade: boolean }> {
  const confirmationDepth =
    options.confirmationDepth ?? DELEGATION_CONFIRMATIONS;
  if (
    !Number.isSafeInteger(confirmationDepth) ||
    confirmationDepth < 0 ||
    confirmationDepth > 32
  )
    throw new Error("Invalid delegation confirmation depth");
  try {
    return await syncNativeDelegationsOnce(
      db,
      provider,
      reader,
      scan,
      progress,
      onDatabaseWait,
      confirmationDepth,
    );
  } catch (error) {
    if (!(error instanceof DelegationCheckpointChangedError)) throw error;
    const restored = await recoverDelegationCheckpoint(
      db,
      provider,
      onDatabaseWait,
    );
    throw new Error(
      restored === null
        ? "Delegation chain changed; rebuilding unverified history automatically on next run (live data preserved)"
        : `Delegation chain changed; restored block ${restored}; automatically resuming on next run`,
    );
  }
}

async function syncNativeDelegationsOnce(
  db: DataSource,
  provider: RecentStateProvider,
  reader: DelegationStateReader,
  scan: (fromBlock: number, toBlock: number) => Promise<void>,
  progress: (completed: number, total: number) => void,
  onDatabaseWait: DatabaseWaitUpdate | undefined,
  confirmationDepth: number,
): Promise<{ block: number; upgrade: boolean }> {
  const start = await prepareNativeDelegationReplay(db);
  const guardedReader = guardRecentDelegationReader(reader, () =>
    provider.getBlockNumber(),
  );
  const upgrade = start.upgrade;
  await verifyDelegationCheckpoint(provider, start);
  const initialHead = await provider.getBlockNumber();
  if (initialHead < start.block)
    throw new Error("Delegation checkpoint is ahead of the chain");
  await captureDelegationRecoveryPoint(db, start, initialHead, onDatabaseWait);
  const scanHead = Math.max(0, initialHead - confirmationDepth);
  if (start.block < scanHead) await scan(start.block + 1, scanHead);
  for (;;) {
    let checkpoint = await db
      .getRepository(NFTDelegationReplayBlock)
      .findOneByOrFail({ id: 1 });
    const head = await provider.getBlockNumber();
    if (head < checkpoint.block)
      throw new Error("Delegation checkpoint is ahead of the chain");
    // A long historical scan or an interrupted reconciliation can leave its
    // target outside AWS's state window. Catch up logs before any eth_call.
    const confirmedHead = Math.max(0, head - confirmationDepth);
    if (confirmedHead - checkpoint.block > 32) {
      await verifyDelegationCheckpoint(provider, checkpoint);
      await scan(checkpoint.block + 1, confirmedHead);
      checkpoint = await db
        .getRepository(NFTDelegationReplayBlock)
        .findOneByOrFail({ id: 1 });
    }
    const snapshotBlock = checkpoint.block;
    assertRecentDelegationSnapshot(
      snapshotBlock,
      await provider.getBlockNumber(),
    );
    const snapshot = await provider.getBlock(snapshotBlock);
    if (!snapshot?.hash)
      throw new Error(
        `Missing delegation snapshot block ${snapshotBlock}; retry to resume reconciliation`,
      );
    if (checkpoint.block_hash && checkpoint.block_hash !== snapshot.hash) {
      throw new DelegationCheckpointChangedError();
    }
    await captureDelegationRecoveryPoint(db, checkpoint, head, onDatabaseWait);
    const groups = await getPendingDelegationGroups(db);
    if (!groups.length) {
      await completeNativeDelegationReplay(db, snapshotBlock, onDatabaseWait);
      return { block: snapshotBlock, upgrade };
    }
    const counts = await db
      .getRepository(ReplayNativeDelegationRegistration)
      .createQueryBuilder("r")
      .select("COUNT(*)", "total")
      .addSelect(
        "COALESCE(SUM(CASE WHEN r.expiry IS NOT NULL THEN 1 ELSE 0 END), 0)",
        "completed",
      )
      .getRawOne<{ completed: number; total: number }>();
    if (!counts) throw new Error("Missing delegation reconciliation progress");
    progress(Number(counts.completed), Number(counts.total));
    const resolved = await mapInChunks(groups, 5, async (group) => {
      const registrations = await getStagedDelegationRegistrations(db, group);
      return reconcileRegistrationExpiries(
        registrations,
        snapshotBlock,
        guardedReader,
      );
    });
    assertRecentDelegationSnapshot(
      snapshotBlock,
      await provider.getBlockNumber(),
    );
    const after = await provider.getBlock(snapshotBlock);
    if (!after?.hash)
      throw new Error(
        `Missing delegation snapshot block ${snapshotBlock}; retry to resume reconciliation`,
      );
    if (after.hash !== snapshot.hash)
      throw new Error(
        "Delegation state snapshot changed; retry to resume reconciliation",
      );
    // Expiry belongs to an immutable registration slot. Save verified groups
    // durably; later event catch-up removes revoked slots and marks new ones
    // pending, so resuming never applies old expiry to a newer registration.
    await mapInChunks(resolved, 1, (registrations) =>
      persistReconciledDelegationGroup(
        db,
        snapshotBlock,
        registrations,
        onDatabaseWait,
      ),
    );
  }
}
