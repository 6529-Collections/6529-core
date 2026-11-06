import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";
import {
  TransactionBlock,
  type PendingTdhConsolidations,
} from "./entities/ITransaction";

export function needsTdhRecalculation(state: TransactionBlock | null): boolean {
  return Boolean(
    state?.tdh_needs_recalculation ||
    state?.tdh_run_incomplete ||
    state?.tdh_pending_consolidations?.wallets.length,
  );
}

export async function getPendingTdhConsolidations(db: EntityManager) {
  const state = await db.getRepository(TransactionBlock).findOneBy({ id: 1 });
  return state?.tdh_pending_consolidations ?? null;
}

// Call inside the transaction that publishes the consolidation changes, so a
// crash cannot leave the live index ahead of its durable recalculation work.
export async function queueTdhConsolidations(
  db: EntityManager,
  wallets: string[],
) {
  if (wallets.length === 0) return;
  const pending = await getPendingTdhConsolidations(db);
  const result = await db.getRepository(TransactionBlock).update(
    { id: 1 },
    {
      tdh_pending_consolidations: {
        revision: randomUUID(),
        wallets: Array.from(
          new Set(
            [...(pending?.wallets ?? []), ...wallets].map((w) =>
              w.toLowerCase(),
            ),
          ),
        ).sort(),
      },
    },
  );
  if (result.affected !== 1) {
    throw new Error("Unable to record pending consolidation TDH recalculation");
  }
}

export async function completeTdhConsolidations(
  db: EntityManager,
  pending: PendingTdhConsolidations | null,
) {
  if (!pending) return;
  // Only acknowledge the work this calculation read. A newer publication,
  // including another change to the same wallets, must remain pending.
  await db
    .getRepository(TransactionBlock)
    .createQueryBuilder()
    .update()
    .set({ tdh_pending_consolidations: null })
    .where("id = :id", { id: 1 })
    .andWhere("tdh_pending_consolidations = :pending", {
      pending: JSON.stringify(pending),
    })
    .execute();
}
