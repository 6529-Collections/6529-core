import { DataSource } from "typeorm";
import { NFTDelegationReplayBlock } from "../../../db/entities/IDelegation";
import {
  assertRecentDelegationSnapshot,
  DelegationStateReader,
  reconcileRegistrationExpiries,
} from "./delegation-registration-expiry";
import {
  getPendingDelegationGroups,
  getStagedDelegationRegistrations,
  persistReconciledDelegationGroup,
  prepareNativeDelegationReplay,
} from "./staged-delegation-sync.db";
import { completeNativeDelegationReplay } from "./nftdelegation-worker.db";
import { mapInChunks } from "./map-in-chunks";

interface RecentStateProvider {
  getBlockNumber(): Promise<number>;
  getBlock(block: number): Promise<{ hash: string | null } | null>;
}

/** Scan durable history, then reconcile bounded batches inside the state window. */
export async function syncNativeDelegations(
  db: DataSource,
  provider: RecentStateProvider,
  reader: DelegationStateReader,
  scan: (fromBlock: number, toBlock: number) => Promise<void>,
  progress: () => void,
): Promise<{ block: number; upgrade: boolean }> {
  const start = await prepareNativeDelegationReplay(db);
  const upgrade = start.upgrade;
  if (
    start.block_hash &&
    (await provider.getBlock(start.block))?.hash !== start.block_hash
  ) {
    throw new Error(
      "Delegation log checkpoint changed; Reset NFTDelegation to rebuild the index",
    );
  }
  const initialHead = await provider.getBlockNumber();
  if (initialHead < start.block)
    throw new Error("Delegation checkpoint is ahead of the chain");
  if (start.block < initialHead) await scan(start.block + 1, initialHead);
  for (;;) {
    let checkpoint = await db
      .getRepository(NFTDelegationReplayBlock)
      .findOneByOrFail({ id: 1 });
    const head = await provider.getBlockNumber();
    if (head < checkpoint.block)
      throw new Error("Delegation checkpoint is ahead of the chain");
    // A long historical scan or an interrupted reconciliation can leave its
    // target outside AWS's state window. Catch up logs before any eth_call.
    if (head - checkpoint.block > 32) {
      await scan(checkpoint.block + 1, head);
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
      throw new Error(`Missing delegation snapshot block ${snapshotBlock}`);
    if (checkpoint.block_hash && checkpoint.block_hash !== snapshot.hash) {
      throw new Error(
        "Delegation log checkpoint changed; Reset NFTDelegation to rebuild the index",
      );
    }
    const groups = await getPendingDelegationGroups(db);
    if (!groups.length) {
      await completeNativeDelegationReplay(db, snapshotBlock);
      return { block: snapshotBlock, upgrade };
    }
    progress();
    const resolved = await mapInChunks(groups, 5, async (group) => {
      const registrations = await getStagedDelegationRegistrations(db, group);
      return reconcileRegistrationExpiries(
        registrations,
        snapshotBlock,
        reader,
      );
    });
    assertRecentDelegationSnapshot(
      snapshotBlock,
      await provider.getBlockNumber(),
    );
    const after = await provider.getBlock(snapshotBlock);
    if (after?.hash !== snapshot.hash)
      throw new Error(
        "Delegation state snapshot changed; retry to resume reconciliation",
      );
    // Expiry belongs to an immutable registration slot. Save verified groups
    // durably; later event catch-up removes revoked slots and marks new ones
    // pending, so resuming never applies old expiry to a newer registration.
    await mapInChunks(resolved, 1, (registrations) =>
      persistReconciledDelegationGroup(db, snapshotBlock, registrations),
    );
  }
}
