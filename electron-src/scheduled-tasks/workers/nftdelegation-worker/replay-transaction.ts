import type { DataSource, EntityManager } from "typeorm";
import { isRetryableSqliteLockError } from "../transactions-worker/transaction-reconciliation";

export type DatabaseWaitUpdate = (waiting: boolean) => void;

/** Each failed attempt finishes rollback before a fresh transaction rereads state. */
export async function retryReplayTransaction<T>(
  db: DataSource,
  onDatabaseWait: DatabaseWaitUpdate | undefined,
  work: (manager: EntityManager) => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 8;
  const baseDelayMs = options.baseDelayMs ?? 250;
  let waiting = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let result: T;
    try {
      result = await db.transaction(work);
    } catch (error) {
      if (!isRetryableSqliteLockError(error) || attempt === maxAttempts) {
        throw error;
      }
      waiting = true;
      onDatabaseWait?.(true);
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), 2000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }
    if (waiting) onDatabaseWait?.(false);
    return result;
  }
  throw new Error("Delegation database retry limit must be positive");
}
