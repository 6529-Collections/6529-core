import Logger from "electron-log";
import {
  ScheduledWorker,
  TransactionsScheduledWorker,
} from "./scheduled-worker";
import {
  ScheduledWorkerDisplay,
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
} from "../../shared/types";

const DEFAULT_BLOCK_RANGE = 500;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 5;

interface ScheduledWorkerConfig {
  name: string;
  display: ScheduledWorkerDisplay;
  cronExpression: string;
  enabled: boolean;
  filePath?: string;
  blockRange?: number;
  maxConcurrentRequests?: number;
}

const getCronExpressionMinutes = (intervalMinutes: number) => {
  return `*/${intervalMinutes} * * * *`;
};

const getCronExpressionHours = (intervalHours: number) => {
  return `0 */${intervalHours} * * *`;
};

const WORKERS: ScheduledWorkerConfig[] = [
  {
    name: ScheduledWorkerNames.TRANSACTIONS_WORKER,
    display: ScheduledWorkerDisplay.TRANSACTIONS_WORKER,
    cronExpression: getCronExpressionMinutes(1),
    enabled: true,
  },
  {
    name: ScheduledWorkerNames.NFT_DELEGATION_WORKER,
    display: ScheduledWorkerDisplay.NFT_DELEGATION_WORKER,
    cronExpression: getCronExpressionMinutes(1),
    enabled: true,
    blockRange: 1000,
  },
  {
    name: ScheduledWorkerNames.NFT_DISCOVERY_WORKER,
    display: ScheduledWorkerDisplay.NFT_DISCOVERY_WORKER,
    cronExpression: getCronExpressionMinutes(2),
    enabled: true,
    filePath: "workers/nft-worker/nft-discovery",
  },
  {
    name: ScheduledWorkerNames.NFT_REFRESH_WORKER,
    display: ScheduledWorkerDisplay.NFT_REFRESH_WORKER,
    cronExpression: getCronExpressionHours(2),
    enabled: true,
    filePath: "workers/nft-worker/nft-refresh",
  },
  {
    name: ScheduledWorkerNames.TDH_WORKER,
    display: ScheduledWorkerDisplay.TDH_WORKER,
    cronExpression: "1 0 * * *",
    enabled: true,
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
    progress?: number,
    target?: number,
    statusPercentage?: number
  ) => void
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
        worker.blockRange ?? DEFAULT_BLOCK_RANGE,
        worker.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
        logDirectory,
        postWorkerUpdate,
        worker.filePath
      );
    } else {
      scheduledWorker = new ScheduledWorker(
        rpcUrl,
        worker.name,
        worker.display,
        worker.cronExpression,
        worker.enabled,
        worker.blockRange ?? DEFAULT_BLOCK_RANGE,
        worker.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
        logDirectory,
        postWorkerUpdate,
        worker.filePath
      );
    }
    scheduledWorkers.push(scheduledWorker);
  }
  Logger.log("All Tasks scheduled.");
  return scheduledWorkers;
}

export function stopSchedulers(scheduledWorkers: ScheduledWorker[]) {
  for (const scheduledWorker of scheduledWorkers) {
    scheduledWorker.stop();
  }
  Logger.log("All Scheduled Tasks stopped.");
}
