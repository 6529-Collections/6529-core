import Logger from "electron-log";
import { ScheduledWorker } from "./scheduled-worker";
import { ScheduledWorkerStatus } from "../../shared/types";

const DEFAULT_BLOCK_RANGE = 250;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 5;

interface ScheduledWorkerConfig {
  name: string;
  interval_minutes: number;
  enabled: boolean;
  filePath?: string;
  blockRange?: number;
  maxConcurrentRequests?: number;
}

const WORKERS: ScheduledWorkerConfig[] = [
  {
    name: "transactions-worker",
    interval_minutes: 1,
    enabled: true,
    blockRange: 2000,
    maxConcurrentRequests: 20,
  },
  {
    name: "nftdelegation-worker",
    interval_minutes: 1,
    enabled: true,
    blockRange: 2000,
    maxConcurrentRequests: 20,
  },
  {
    name: "nft-discovery-worker",
    interval_minutes: 2,
    enabled: true,
    filePath: "workers/nft-worker/nft-discovery",
  },
  {
    name: "nft-refresh-worker",
    interval_minutes: 60,
    enabled: true,
    filePath: "workers/nft-worker/nft-refresh",
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
    const scheduledWorker = new ScheduledWorker(
      rpcUrl,
      worker.name,
      worker.interval_minutes,
      worker.enabled,
      worker.blockRange ?? DEFAULT_BLOCK_RANGE,
      worker.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
      logDirectory,
      postWorkerUpdate,
      worker.filePath
    );
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
