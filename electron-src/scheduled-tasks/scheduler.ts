import { Worker } from "worker_threads";
import cron from "node-cron";
import path from "path";
import Logger from "electron-log";
import { getBaseDbParams } from "../db/db";
import { BetterSqlite3ConnectionOptions } from "typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions";

export interface WorkerData {
  dbParams: BetterSqlite3ConnectionOptions;
}

const TRANSACTIONS_WORKER = "transactions-worker";

let transactionsScheduler: cron.ScheduledTask | null = null;

const runningWorkers = new Set<string>();

export function scheduleMinutes(x: number, taskFunction: () => void) {
  if (x <= 0 || x > 59) {
    throw new Error("Minutes must be between 1 and 59");
  }

  const cronExpression = `*/${x} * * * *`;
  return cron.schedule(cronExpression, taskFunction);
}

export function startSchedulers() {
  transactionsScheduler = scheduleMinutes(1, () => {
    if (!runningWorkers.has(TRANSACTIONS_WORKER)) {
      startWorker(TRANSACTIONS_WORKER);
    } else {
      Logger.log(`[${TRANSACTIONS_WORKER}] Worker is already running.`);
    }
  });
  startWorker(TRANSACTIONS_WORKER);
  Logger.log("All Scheduled Tasks started.");
}

export function stopSchedulers() {
  if (transactionsScheduler) {
    transactionsScheduler.stop();
  }
  Logger.log("All Scheduled Tasks stopped.");
}

const startWorker = (name: string) => {
  Logger.log(`Starting scheduled task [${name}]`);

  // Path to the compiled worker script
  const workerPath = path.join(__dirname, `workers/${name}/index.js`);

  // Create a new worker thread for each scheduled execution
  const worker = new Worker(workerPath, {
    workerData: {
      dbParams: getBaseDbParams(),
    } as WorkerData,
  });

  // Listen for messages from the worker
  worker.on("message", (message) => {
    Logger.log(`[${name}]`, "Worker message:", message);
  });

  // Handle worker errors
  worker.on("error", (error) => {
    Logger.error(`[${name}]`, "Worker error:", error);
  });

  // Handle worker exit events
  worker.on("exit", (code) => {
    if (code !== 0) {
      Logger.error(`[${name}]`, `Worker stopped with exit code ${code}`);
    }
  });

  worker.on("exit", (code) => {
    runningWorkers.delete(name);
    Logger.error(`[${name}]`, `Worker exited with code ${code}`);
  });

  runningWorkers.add(name);
};
