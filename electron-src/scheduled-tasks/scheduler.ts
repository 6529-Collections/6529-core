import Logger from "electron-log";
import {
  ResettableScheduledWorker,
  ScheduledWorker,
  TransactionsScheduledWorker,
} from "./scheduled-worker";
import {
  ScheduledWorkerDisplay,
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
} from "../../shared/types";
import {
  createTdhTransactionMutationGuard,
  createTransactionMutationTdhGuard,
} from "./transaction-mutation-guard";
import type {
  TransactionReconciliationState,
} from "./workers/transactions-worker/transactions-worker.db";
import { getTdhRestartAction } from "./workers/tdh-worker/tdh-restart";

const DEFAULT_BLOCK_RANGE = 500;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 5;

interface ScheduledWorkerConfig {
  name: string;
  display: ScheduledWorkerDisplay;
  cronExpression: string;
  enabled: boolean;
  description: string;
  filePath?: string;
  blockRange?: number;
  maxConcurrentRequests?: number;
}

const WORKER_CONFLICTS: Partial<
  Record<ScheduledWorkerNames, ScheduledWorkerNames[]>
> = {
  [ScheduledWorkerNames.NFT_DELEGATION_WORKER]: [
    ScheduledWorkerNames.TDH_WORKER,
  ],
  [ScheduledWorkerNames.NFTS_WORKER]: [ScheduledWorkerNames.TDH_WORKER],
  [ScheduledWorkerNames.TDH_WORKER]: [
    ScheduledWorkerNames.NFT_DELEGATION_WORKER,
    ScheduledWorkerNames.NFTS_WORKER,
  ],
};

const getCronExpressionMinutes = (intervalMinutes: number) => {
  return `*/${intervalMinutes} * * * *`;
};

const WORKERS: ScheduledWorkerConfig[] = [
  {
    name: ScheduledWorkerNames.TRANSACTIONS_WORKER,
    display: ScheduledWorkerDisplay.TRANSACTIONS_WORKER,
    cronExpression: getCronExpressionMinutes(1),
    enabled: true,
    description:
      "Fetches blockchain transactions related to the 6529 contracts.",
  },
  {
    name: ScheduledWorkerNames.NFT_DELEGATION_WORKER,
    display: ScheduledWorkerDisplay.NFT_DELEGATION_WORKER,
    cronExpression: getCronExpressionMinutes(1),
    enabled: true,
    blockRange: 1000,
    description:
      "Monitors and updates events from the NFT Delegation contract.",
  },
  {
    name: ScheduledWorkerNames.NFTS_WORKER,
    display: ScheduledWorkerDisplay.NFTS_WORKER,
    cronExpression: getCronExpressionMinutes(2),
    enabled: true,
    filePath: "workers/nft-worker/nft-discovery",
    description:
      "Discovers new NFTs and refreshes existing NFTs in your node's database.",
  },
  {
    name: ScheduledWorkerNames.TDH_WORKER,
    display: ScheduledWorkerDisplay.TDH_WORKER,
    cronExpression: "15 0 * * *",
    enabled: true,
    description: "The computer process in your node that calculates TDH.",
  },
];

export function startSchedulers(
  rpcUrl: string | null,
  logDirectory: string,
  postWorkerUpdate: (
    namespace: string,
    status: ScheduledWorkerStatus,
    message: string,
    action?: string,
    statusPercentage?: number,
  ) => void,
  pendingTransactionReconciliation: TransactionReconciliationState | null =
    null,
  incompleteTdhRun = false,
) {
  if (!logDirectory) {
    throw new Error("Log directory is required");
  }

  const scheduledWorkers: ScheduledWorker[] = [];
  for (const worker of WORKERS) {
    if (scheduledWorkers.some((sw) => sw.getNamespace() === worker.name)) {
      Logger.log(`${worker.name} already scheduled`);
      continue;
    }
    let scheduledWorker: ScheduledWorker;
    if (worker.name === ScheduledWorkerNames.TRANSACTIONS_WORKER) {
      scheduledWorker = new TransactionsScheduledWorker(
        rpcUrl,
        worker.name,
        worker.display,
        worker.cronExpression,
        worker.enabled,
        worker.description,
        worker.blockRange ?? DEFAULT_BLOCK_RANGE,
        worker.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
        logDirectory,
        postWorkerUpdate,
        worker.filePath,
      );
    } else if (
      worker.name === ScheduledWorkerNames.NFT_DELEGATION_WORKER ||
      worker.name === ScheduledWorkerNames.NFTS_WORKER
    ) {
      scheduledWorker = new ResettableScheduledWorker(
        rpcUrl,
        worker.name,
        worker.display,
        worker.cronExpression,
        worker.enabled,
        worker.description,
        worker.blockRange ?? DEFAULT_BLOCK_RANGE,
        worker.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
        logDirectory,
        postWorkerUpdate,
        worker.filePath,
      );
    } else {
      scheduledWorker = new ScheduledWorker(
        rpcUrl,
        worker.name,
        worker.display,
        worker.cronExpression,
        worker.enabled,
        worker.description,
        worker.blockRange ?? DEFAULT_BLOCK_RANGE,
        worker.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
        logDirectory,
        postWorkerUpdate,
        worker.filePath,
      );
    }
    scheduledWorkers.push(scheduledWorker);
  }

  const transactionsWorker = scheduledWorkers.find(
    (worker) =>
      worker.getNamespace() === ScheduledWorkerNames.TRANSACTIONS_WORKER,
  ) as TransactionsScheduledWorker | undefined;
  const tdhWorker = scheduledWorkers.find(
    (worker) => worker.getNamespace() === ScheduledWorkerNames.TDH_WORKER,
  );
  const transactionMutationTdhGuard = createTransactionMutationTdhGuard(
    () => transactionsWorker?.isMutationRunning() ?? false,
  );

  for (const scheduledWorker of scheduledWorkers) {
    const workerName = scheduledWorker.getNamespace() as ScheduledWorkerNames;
    const conflictNames = WORKER_CONFLICTS[workerName] ?? [];
    if (conflictNames.length === 0) {
      continue;
    }
    scheduledWorker.setStartGuard(() => {
      const conflict = scheduledWorkers.find((candidate) => {
        const candidateName = candidate.getNamespace() as ScheduledWorkerNames;
        return conflictNames.includes(candidateName) && candidate.isRunning();
      });
      if (conflict) {
        return `${conflict.getDisplay()} worker is running`;
      }
      if (workerName === ScheduledWorkerNames.TDH_WORKER) {
        return transactionMutationTdhGuard();
      }
      return null;
    });
  }

  transactionsWorker?.setMutationGuard(
    createTdhTransactionMutationGuard(() => tdhWorker?.isRunning() ?? false),
  );

  for (const completedWorker of scheduledWorkers) {
    completedWorker.addExitListener(() => {
      // Resume only starts that were actually requested while blocked. A
      // transaction mutation marks TDH stale, but does not itself request an
      // automatic TDH calculation; a later manual or scheduled start runs
      // normally through the same guard.
      for (const queuedWorker of scheduledWorkers) {
        if (queuedWorker !== completedWorker) {
          queuedWorker.retryQueuedStart();
        }
      }
    });
  }

  for (const scheduledWorker of scheduledWorkers) {
    if (
      scheduledWorker.isEnabled() &&
      scheduledWorker.getNamespace() !== ScheduledWorkerNames.TDH_WORKER
    ) {
      Logger.log(`Starting ${scheduledWorker.getNamespace()}`);
      if (
        scheduledWorker === transactionsWorker &&
        pendingTransactionReconciliation
      ) {
        const resume = transactionsWorker.resumeReconciliation(
          pendingTransactionReconciliation,
        );
        Logger.log(resume.message);
      } else {
        scheduledWorker.manualStart();
      }
    }
  }

  if (pendingTransactionReconciliation && !transactionsWorker?.isEnabled()) {
    Logger.log(
      "Transaction reconciliation remains pending because the transactions worker is disabled; it will resume after restart with an active RPC provider.",
    );
  }

  const tdhRestartAction = getTdhRestartAction(
    incompleteTdhRun,
    tdhWorker?.isEnabled() ?? false,
  );
  if (tdhRestartAction === "rerun" && tdhWorker) {
    // manualStart always launches a fresh TDH calculation; the existing
    // guards queue it when a conflicting startup worker is still running.
    const rerun = tdhWorker.manualStart();
    Logger.log(`Interrupted TDH run detected — ${rerun.message}`);
  } else if (tdhRestartAction === "defer") {
    Logger.log(
      "Interrupted TDH run remains pending because the TDH worker is disabled; it will rerun after restart with an active RPC provider.",
    );
  }

  Logger.log("All Tasks scheduled.");
  return scheduledWorkers;
}

export async function stopSchedulers(scheduledWorkers: ScheduledWorker[]) {
  for (const scheduledWorker of scheduledWorkers) {
    await scheduledWorker.terminate();
  }
  Logger.log("All Scheduled Tasks stopped.");
}
