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
    cronExpression: "1 0 * * *",
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
        worker.description,
        worker.blockRange ?? DEFAULT_BLOCK_RANGE,
        worker.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
        logDirectory,
        postWorkerUpdate,
        worker.filePath
      );
    } else if (worker.name === ScheduledWorkerNames.NFT_DELEGATION_WORKER) {
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
        worker.filePath
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
        worker.filePath
      );
    }
    if (worker.enabled && worker.name !== ScheduledWorkerNames.TDH_WORKER) {
      Logger.log(`Starting ${worker.name}`);
      scheduledWorker.manualStart();
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
