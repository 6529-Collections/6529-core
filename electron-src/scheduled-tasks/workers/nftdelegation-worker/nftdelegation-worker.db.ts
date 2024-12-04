import { DataSource, EntityManager, LessThan } from "typeorm";
import {
  Consolidation,
  ConsolidationEvent,
  Delegation,
  DelegationEvent,
  EventType,
  NFTDelegationBlock,
  Event,
} from "../../../db/entities/IDelegation";

export async function getLatestNFTDBlock(db: DataSource): Promise<number> {
  const repo = db.getRepository(NFTDelegationBlock);
  const block = await repo.findOne({ where: { id: 1 } });
  return block?.block ?? 0;
}

export async function persistNftDelegations(
  db: DataSource,
  endBlock: number,
  timestamp: number,
  nftDelegations: {
    consolidations: Event[];
    registrations: DelegationEvent[];
    revocations: DelegationEvent[];
  },
  maxRetries: number = 5,
  delayMs: number = 100
) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      await db.transaction(async (transaction) => {
        await persistConsolidations(transaction, nftDelegations.consolidations);
        await persistDelegations(
          transaction,
          nftDelegations.registrations,
          nftDelegations.revocations
        );
        await persistNftDelegationBlock(transaction, endBlock, timestamp);
      });
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("database is locked")
      ) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(
            `Updating Database failed after ${maxRetries} retries due to database lock.`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
}

async function persistConsolidations(
  transaction: EntityManager,
  consolidations: ConsolidationEvent[]
) {
  const repo = transaction.getRepository(Consolidation);

  for (const consolidation of consolidations) {
    if (consolidation.type == EventType.REGISTER) {
      const r = await repo.findOne({
        where: {
          wallet1: consolidation.wallet1,
          wallet2: consolidation.wallet2,
        },
      });
      if (r) {
        // do nothing
      } else {
        const r2 = await repo.findOne({
          where: {
            wallet1: consolidation.wallet2,
            wallet2: consolidation.wallet1,
          },
        });
        if (r2) {
          await repo.remove(r2);
          const updatedConsolidation = new Consolidation();
          updatedConsolidation.block = consolidation.block;
          updatedConsolidation.wallet1 = consolidation.wallet2;
          updatedConsolidation.wallet2 = consolidation.wallet1;
          updatedConsolidation.confirmed = true;
          await repo.save(updatedConsolidation);
        } else {
          const newConsolidation = new Consolidation();
          newConsolidation.block = consolidation.block;
          newConsolidation.wallet1 = consolidation.wallet1;
          newConsolidation.wallet2 = consolidation.wallet2;
          await repo.save(newConsolidation);
        }
      }
    } else if (consolidation.type == EventType.REVOKE) {
      const r = await repo.findOne({
        where: {
          wallet1: consolidation.wallet1,
          wallet2: consolidation.wallet2,
        },
      });
      if (r) {
        if (r.confirmed) {
          await repo.remove(r);
          const newConsolidation = new Consolidation();
          newConsolidation.block = consolidation.block;
          newConsolidation.wallet1 = consolidation.wallet2;
          newConsolidation.wallet2 = consolidation.wallet1;
          await repo.save(newConsolidation);
        } else {
          await repo.remove(r);
        }
      } else {
        const r2 = await repo.findOne({
          where: {
            wallet1: consolidation.wallet2,
            wallet2: consolidation.wallet1,
          },
        });
        if (r2) {
          await repo.remove(r2);
          const updatedConsolidation = new Consolidation();
          updatedConsolidation.block = consolidation.block;
          updatedConsolidation.wallet1 = consolidation.wallet2;
          updatedConsolidation.wallet2 = consolidation.wallet1;
          updatedConsolidation.confirmed = false;
          await repo.save(updatedConsolidation);
        }
      }
    }
  }
}

async function persistDelegations(
  transaction: EntityManager,
  registrations: DelegationEvent[],
  revocations: DelegationEvent[]
) {
  const repo = transaction.getRepository(Delegation);

  for (const registration of registrations) {
    const newDelegation = new Delegation();
    newDelegation.block = registration.block;
    newDelegation.from_address = registration.wallet1;
    newDelegation.to_address = registration.wallet2;
    newDelegation.collection = registration.collection;
    newDelegation.use_case = registration.use_case;
    if (registration.expiry) {
      newDelegation.expiry = registration.expiry;
    }
    if (registration.all_tokens) {
      newDelegation.all_tokens = registration.all_tokens;
    }
    if (registration.token_id) {
      newDelegation.token_id = registration.token_id;
    }
    await repo.save(newDelegation);
  }

  for (const revocation of revocations) {
    const r = await repo.find({
      where: {
        from_address: revocation.wallet1,
        to_address: revocation.wallet2,
        use_case: revocation.use_case,
        collection: revocation.collection,
        block: LessThan(revocation.block),
      },
    });

    if (r) {
      await repo.remove(r);
    }
  }
}

export async function persistNftDelegationBlock(
  transaction: EntityManager,
  blockNo: number,
  timestamp: number
) {
  const block = new NFTDelegationBlock();
  block.block = blockNo;
  block.timestamp = timestamp;
  await transaction.getRepository(NFTDelegationBlock).save(block);
  await transaction.getRepository(NFTDelegationBlock).upsert(
    {
      id: 1,
      block: blockNo,
      timestamp,
    },
    ["id"]
  );
}
