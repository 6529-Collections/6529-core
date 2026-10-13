import { DataSource, EntityManager } from "typeorm";
import {
  Consolidation,
  ConsolidationEvent,
  NFTDelegationBlock,
  ReplayConsolidation,
  ReplayDelegation,
  NFTDelegationReplayBlock,
  Delegation,
  NativeDelegationRegistration,
  ReplayNativeDelegationRegistration,
} from "../../../db/entities/IDelegation";
import { planConsolidationEvent } from "./consolidation-row-plan";
import { writeDelegations } from "./delegation-row";
import { NativeDelegationScan } from "./delegation-logs";
import { NATIVE_DELEGATION_INDEX_VERSION } from "../../../../electron-constants";
import { setTdhRecalculationNeeded } from "../transactions-worker/transactions-worker.db";
import {
  retryReplayTransaction,
  type DatabaseWaitUpdate,
} from "./replay-transaction";
import {
  writeStagedDelegationEvents,
  replaceIndexTable,
} from "./staged-delegation-sync.db";

export async function getLatestNFTDBlock(db: DataSource): Promise<number> {
  const block = await db
    .getRepository(NFTDelegationBlock)
    .findOne({ where: { id: 1 } });
  return block?.block ?? 0;
}

export async function isNativeDelegationIndexReady(
  db: DataSource,
): Promise<boolean> {
  const block = await db
    .getRepository(NFTDelegationBlock)
    .findOne({ where: { id: 1 } });
  return block?.index_version === NATIVE_DELEGATION_INDEX_VERSION;
}

export async function persistNftDelegations(
  db: DataSource,
  endBlock: number,
  timestamp: number,
  nftDelegations: NativeDelegationScan,
  maxRetries: number = 5,
  delayMs: number = 100,
  replay = false,
  blockHash?: string,
) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await db.transaction(async (transaction) => {
        await persistConsolidations(
          transaction,
          nftDelegations.consolidations,
          replay,
        );
        if (replay) {
          await writeStagedDelegationEvents(transaction, nftDelegations);
          const checkpoint = await transaction
            .getRepository(NFTDelegationReplayBlock)
            .findOneBy({ id: 1 });
          await transaction.getRepository(NFTDelegationReplayBlock).upsert(
            {
              id: 1,
              block: endBlock,
              timestamp,
              index_version: NATIVE_DELEGATION_INDEX_VERSION,
              block_hash: blockHash ?? null,
              consolidations_changed:
                checkpoint?.consolidations_changed === true ||
                nftDelegations.consolidations.length > 0,
            },
            ["id"],
          );
        } else {
          await writeDelegations(
            transaction.getRepository(Delegation),
            undefined,
            nftDelegations.registrations,
            nftDelegations.revocations,
          );
          await persistNftDelegationBlock(transaction, endBlock, timestamp);
          // Durable even if the worker exits before immediate reconsolidation.
          if (nftDelegations.consolidations.length)
            await setTdhRecalculationNeeded(transaction, true);
        }
      });
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("database is locked")
      )
        throw error;
      if (++attempt >= maxRetries) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}

async function persistConsolidations(
  transaction: EntityManager,
  events: ConsolidationEvent[],
  replay: boolean,
) {
  const repo = transaction.getRepository(
    replay ? ReplayConsolidation : Consolidation,
  );
  for (const event of events) {
    if (!Number.isSafeInteger(event.timestamp) || event.timestamp! <= 0) {
      throw new Error(
        `Missing consolidation registration block time at ${event.block}`,
      );
    }
    const same = await repo.findOne({
      where: { wallet1: event.wallet1, wallet2: event.wallet2 },
    });
    const reverse = same
      ? null
      : await repo.findOne({
          where: { wallet1: event.wallet2, wallet2: event.wallet1 },
        });
    const plan = planConsolidationEvent(event, same, reverse);
    if (plan.remove.length) await repo.remove(plan.remove);
    if (plan.save.length) await repo.save(plan.save);
  }
}

export async function persistNftDelegationBlock(
  transaction: EntityManager,
  block: number,
  timestamp: number,
) {
  await transaction
    .getRepository(NFTDelegationBlock)
    .upsert({ id: 1, block, timestamp }, ["id"]);
}

/** Keep the current live index available until the entire replay is durable. */
export async function completeNativeDelegationReplay(
  db: DataSource,
  endBlock: number,
  onDatabaseWait?: DatabaseWaitUpdate,
) {
  await retryReplayTransaction(db, onDatabaseWait, async (manager) => {
    const checkpoint = await manager
      .getRepository(NFTDelegationReplayBlock)
      .findOne({ where: { id: 1 } });
    if (
      !checkpoint ||
      checkpoint.block !== endBlock ||
      checkpoint.index_version !== NATIVE_DELEGATION_INDEX_VERSION
    )
      throw new Error("Delegation replay checkpoint incomplete");
    const pending = await manager
      .getRepository(ReplayNativeDelegationRegistration)
      .createQueryBuilder("registration")
      .where("registration.expiry IS NULL")
      .getCount();
    if (pending)
      throw new Error("Delegation replay expiry reconciliation incomplete");
    for (const [live, shadow] of [
      [Consolidation, ReplayConsolidation],
      [Delegation, ReplayDelegation],
      [NativeDelegationRegistration, ReplayNativeDelegationRegistration],
    ]) {
      await replaceIndexTable(manager, live, shadow);
    }
    await manager.getRepository(NFTDelegationBlock).upsert(
      {
        id: 1,
        block: endBlock,
        timestamp: checkpoint.timestamp,
        index_version: NATIVE_DELEGATION_INDEX_VERSION,
        block_hash: checkpoint.block_hash,
      },
      ["id"],
    );
    if (checkpoint.upgrade || checkpoint.consolidations_changed) {
      await setTdhRecalculationNeeded(manager, true);
    }
    await manager.getRepository(ReplayConsolidation).clear();
    await manager.getRepository(ReplayDelegation).clear();
    await manager.getRepository(ReplayNativeDelegationRegistration).clear();
    await manager.getRepository(NFTDelegationReplayBlock).clear();
  });
}

/** An explicit reset restarts the shadow replay, preserving the live rows. */
export async function resetNativeDelegationReplay(db: DataSource) {
  await db.transaction(async (manager) => {
    await manager.getRepository(ReplayConsolidation).clear();
    await manager.getRepository(ReplayDelegation).clear();
    await manager.getRepository(ReplayNativeDelegationRegistration).clear();
    await manager.getRepository(NFTDelegationReplayBlock).clear();
    await manager
      .getRepository(NFTDelegationBlock)
      .update({ id: 1 }, { index_version: 0 });
  });
}
