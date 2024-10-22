import Logger from "electron-log";
import { WorkerLogger } from "./worker-logger";
import cron from "node-cron";
import path from "path";
import { getBaseDbParams } from "../db/db";
import { CoreWorkerMessage, CoreWorkerMessageUpdate } from "./worker-helpers";
import { Worker } from "worker_threads";
import { BetterSqlite3ConnectionOptions } from "typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions";
import { ScheduledWorkerStatus } from "../../shared/types";

export interface WorkerData {
  rpcUrl: string;
  dbParams: BetterSqlite3ConnectionOptions;
  blockRange: number;
  maxConcurrentRequests: number;
}

export class ScheduledWorker {
  private rpcUrl: string | null;
  private namespace: string;
  private interval_minutes: number;
  private enabled: boolean;
  private filePath: string;
  private blockRange: number;
  private maxConcurrentRequests: number;
  private logger: WorkerLogger;
  private task: cron.ScheduledTask | null = null;
  private isWorkerRunning: boolean = false;

  private update: CoreWorkerMessageUpdate = {
    status: ScheduledWorkerStatus.IDLE,
    message: "",
    progress: 0,
    target: 0,
    statusPercentage: 0,
  };

  private postWorkerUpdate: (
    namespace: string,
    status: ScheduledWorkerStatus,
    message: string,
    action?: string,
    progress?: number,
    target?: number,
    statusPercentage?: number
  ) => void;

  constructor(
    rpcUrl: string | null,
    namespace: string,
    interval_minutes: number,
    enabled: boolean,
    blockRange: number,
    maxConcurrentRequests: number,
    logDirectory: string,
    postWorkerUpdate: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      progress?: number,
      target?: number,
      statusPercentage?: number
    ) => void,
    filePath?: string
  ) {
    this.rpcUrl = rpcUrl;
    this.namespace = namespace;
    this.interval_minutes = interval_minutes;
    this.enabled = enabled && !!this.rpcUrl;
    this.filePath = filePath
      ? `${filePath}.js`
      : `workers/${this.namespace}/index.js`;
    this.blockRange = blockRange;
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.logger = new WorkerLogger(namespace, logDirectory);
    this.postWorkerUpdate = postWorkerUpdate;
    if (this.enabled) {
      this.task = this.schedule();
    } else {
      this.update.status = ScheduledWorkerStatus.DISABLED;
    }
    this.postWorkerUpdate(
      this.namespace,
      this.update.status,
      this.update.message
    );
  }

  private schedule() {
    if (this.interval_minutes <= 0 || this.interval_minutes > 60) {
      throw new Error("Interval minutes must be between 1 and 60");
    }

    const cronExpression = `*/${this.interval_minutes} * * * *`;

    //TODO: remove below
    // this.startWorker();
    // END TODO

    return cron.schedule(cronExpression, () => {
      this.startWorker();
    });
  }

  private startWorker() {
    if (this.isWorkerRunning) {
      return;
    }

    this.logger.log("info", `Starting task\n\n---------- New Run ----------\n`);

    Logger.log(`[${this.namespace}] Starting scheduled task execution`);
    this.isWorkerRunning = true;

    Logger.log(`[${this.namespace}] Starting worker at ${this.filePath}`);

    // Path to the compiled worker script
    const workerPath = path.join(__dirname, this.filePath);

    // Create a new worker thread for each scheduled execution
    const worker = new Worker(workerPath, {
      workerData: {
        rpcUrl: this.rpcUrl,
        dbParams: getBaseDbParams(),
        blockRange: this.blockRange,
        maxConcurrentRequests: this.maxConcurrentRequests,
      } as WorkerData,
    });

    worker.on("message", (message: CoreWorkerMessage) => {
      if (message.log) {
        if (message.log.level === "error") {
          Logger.error(
            `[${this.namespace}]`,
            message.log.args[0],
            message.log.args[1]
          );
        }
        this.logger.log(message.log.level, ...message.log.args);
      } else if (message.update) {
        this.update = message.update;
        this.postWorkerUpdate(
          this.namespace,
          this.update.status,
          this.update.message,
          this.update.action,
          this.update.progress,
          this.update.target,
          this.update.statusPercentage
        );
      }
    });

    worker.on("error", (error) => {
      Logger.error(`[${this.namespace}]`, error);
      this.logger.error(error);
    });

    worker.on("exit", (code) => {
      this.logger.log("info", `Worker exited with code ${code}`);
      Logger.log(`[${this.namespace}]`, `Worker exited with code ${code}`);
      this.isWorkerRunning = false;
    });
  }

  public getNamespace(): string {
    return this.namespace;
  }

  public getLogger(): WorkerLogger {
    return this.logger;
  }

  public getLogFilePath(): string {
    return this.logger.getLogFilePath();
  }

  public getInterval(): number {
    return this.interval_minutes;
  }

  public getStatus(): {
    message: string;
    status: ScheduledWorkerStatus;
    action?: string;
    progress?: number;
    target?: number;
    statusPercentage?: number;
  } {
    return {
      message: this.update.message,
      status: this.update.status,
      action: this.update.action,
      progress: this.update.progress,
      target: this.update.target,
      statusPercentage: this.update.statusPercentage,
    };
  }

  public isRunning(): boolean {
    return this.isWorkerRunning;
  }

  public stop() {
    this.task?.stop();
  }
}
