import Logger from "electron-log";
import { WorkerLogger } from "./worker-logger";
import cron from "node-cron";
import path from "path";
import { getBaseDbParams } from "../db/db";
import { CoreWorkerMessage, CoreWorkerMessageUpdate } from "./worker-helpers";
import { Worker } from "worker_threads";
import { BetterSqlite3ConnectionOptions } from "typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions";
import {
  ScheduledWorkerStatus,
  TransactionsWorkerScope,
} from "../../shared/types";

export interface WorkerData {
  rpcUrl: string;
  dbParams: BetterSqlite3ConnectionOptions;
  blockRange: number;
  maxConcurrentRequests: number;
}

export interface TransactionsWorkerData extends WorkerData {
  scope?: TransactionsWorkerScope;
  block?: number;
}

export interface ResettableWorkerData extends WorkerData {
  reset?: boolean;
}

export class ScheduledWorker {
  protected rpcUrl: string | null;
  protected namespace: string;
  protected display: string;
  protected cronExpression: string;
  protected enabled: boolean;
  protected description: string;
  protected filePath: string;
  protected blockRange: number;
  protected maxConcurrentRequests: number;
  protected logger: WorkerLogger;
  private task: cron.ScheduledTask | null = null;
  protected worker: Worker | null = null;

  protected update: CoreWorkerMessageUpdate = {
    status: ScheduledWorkerStatus.IDLE,
    message: "",
    statusPercentage: 0,
  };

  protected postWorkerUpdate: (
    namespace: string,
    status: ScheduledWorkerStatus,
    message: string,
    action?: string,
    statusPercentage?: number
  ) => void;

  constructor(
    rpcUrl: string | null,
    namespace: string,
    display: string,
    cronExpression: string,
    enabled: boolean,
    description: string,
    blockRange: number,
    maxConcurrentRequests: number,
    logDirectory: string,
    postWorkerUpdate: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => void,
    filePath?: string
  ) {
    this.rpcUrl = rpcUrl;
    this.namespace = namespace;
    this.display = display;
    if (!cron.validate(cronExpression)) {
      throw new Error("Invalid cron expression");
    }
    this.cronExpression = cronExpression;
    this.enabled = enabled && !!this.rpcUrl;
    this.description = description;
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
    return cron.schedule(
      this.cronExpression,
      () => {
        this.startWorker();
      },
      {
        timezone: "Etc/UTC",
      }
    );
  }

  public manualStart() {
    if (this.worker || !this.enabled || this.isRunning()) {
      return false;
    }
    this.startWorker();
    return true;
  }

  protected startWorker(workerData?: WorkerData | TransactionsWorkerData) {
    if (this.worker) {
      return;
    }

    if (!workerData) {
      workerData = {
        rpcUrl: this.rpcUrl,
        dbParams: getBaseDbParams(),
        blockRange: this.blockRange,
        maxConcurrentRequests: this.maxConcurrentRequests,
      } as WorkerData;
    }

    this.logger.log("info", `Starting task\n\n---------- New Run ----------\n`);

    Logger.log(`[${this.namespace}] Starting scheduled task execution`);

    Logger.log(`[${this.namespace}] Starting worker at ${this.filePath}`);

    // Path to the compiled worker script
    const workerPath = path.join(__dirname, this.filePath);

    // Create a new worker thread for each scheduled execution
    this.worker = new Worker(workerPath, {
      workerData,
    });

    this.worker.on("message", (message: CoreWorkerMessage) => {
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
          this.update.statusPercentage
        );
      }
    });

    this.worker.on("error", (error) => {
      Logger.error(`[${this.namespace}]`, error);
      this.logger.error(error);
    });

    this.worker.on("exit", (code) => {
      this.logger.log("info", `Worker exited with code ${code}`);
      Logger.log(`[${this.namespace}]`, `Worker exited with code ${code}`);
      this.worker?.removeAllListeners();
      this.worker = null;
    });
  }

  public getNamespace(): string {
    return this.namespace;
  }

  public getDisplay(): string {
    return this.display;
  }

  public getLogger(): WorkerLogger {
    return this.logger;
  }

  public getLogFilePath(): string {
    return this.logger.getLogFilePath();
  }

  public getCronExpression(): string {
    return this.cronExpression;
  }

  public getStatus(): {
    message: string;
    status: ScheduledWorkerStatus;
    action?: string;
    statusPercentage?: number;
  } {
    return {
      message: this.update.message,
      status: this.update.status,
      action: this.update.action,
      statusPercentage: this.update.statusPercentage,
    };
  }

  public getDescription(): string {
    return this.description;
  }

  public isRunning(): boolean {
    return !!this.worker;
  }

  public stop() {
    this.task?.stop();
    this.worker?.terminate();
  }
}

export class TransactionsScheduledWorker extends ScheduledWorker {
  constructor(
    rpcUrl: string | null,
    namespace: string,
    display: string,
    cronExpression: string,
    enabled: boolean,
    description: string,
    blockRange: number,
    maxConcurrentRequests: number,
    logDirectory: string,
    postWorkerUpdate: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => void,
    filePath?: string
  ) {
    super(
      rpcUrl,
      namespace,
      display,
      cronExpression,
      enabled,
      description,
      blockRange,
      maxConcurrentRequests,
      logDirectory,
      postWorkerUpdate,
      filePath
    );
  }

  public async resetToBlock(block: number) {
    if (this.worker || this.isRunning()) {
      return {
        status: false,
        message: "Transactions worker is already running",
      };
    }

    if (!this.enabled) {
      return {
        status: false,
        message: "Worker is disabled",
      };
    }

    const workerData: TransactionsWorkerData = {
      rpcUrl: this.rpcUrl,
      dbParams: getBaseDbParams(),
      blockRange: this.blockRange,
      maxConcurrentRequests: this.maxConcurrentRequests,
      scope: TransactionsWorkerScope.RESET_TO_BLOCK,
      block,
    } as TransactionsWorkerData;

    this.startWorker(workerData);

    return {
      status: true,
      message: `Reset to block ${block} started`,
    };
  }

  public async recalculateTransactionsOwners() {
    if (this.worker || this.isRunning()) {
      return {
        status: false,
        message: "Transactions worker is already running",
      };
    }

    if (!this.enabled) {
      return {
        status: false,
        message: "Worker is disabled",
      };
    }

    const workerData: TransactionsWorkerData = {
      rpcUrl: this.rpcUrl,
      dbParams: getBaseDbParams(),
      blockRange: this.blockRange,
      maxConcurrentRequests: this.maxConcurrentRequests,
      scope: TransactionsWorkerScope.RECALCULATE_OWNERS,
    } as TransactionsWorkerData;

    this.startWorker(workerData);

    return {
      status: true,
      message: "Owner recalculation started",
    };
  }
}

export class ResettableScheduledWorker extends ScheduledWorker {
  constructor(
    rpcUrl: string | null,
    namespace: string,
    display: string,
    cronExpression: string,
    enabled: boolean,
    description: string,
    blockRange: number,
    maxConcurrentRequests: number,
    logDirectory: string,
    postWorkerUpdate: (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => void,
    filePath?: string
  ) {
    super(
      rpcUrl,
      namespace,
      display,
      cronExpression,
      enabled,
      description,
      blockRange,
      maxConcurrentRequests,
      logDirectory,
      postWorkerUpdate,
      filePath
    );
  }

  public async reset() {
    if (this.worker || this.isRunning()) {
      return {
        status: false,
        message: "Worker is already running",
      };
    }

    if (!this.enabled) {
      return {
        status: false,
        message: "Worker is disabled",
      };
    }

    const workerData: ResettableWorkerData = {
      rpcUrl: this.rpcUrl,
      dbParams: getBaseDbParams(),
      blockRange: this.blockRange,
      maxConcurrentRequests: this.maxConcurrentRequests,
      reset: true,
    } as ResettableWorkerData;

    this.startWorker(workerData);

    return {
      status: true,
      message: `Reset started`,
    };
  }
}
