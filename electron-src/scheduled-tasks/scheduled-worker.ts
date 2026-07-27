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
import { getTransactionMutationBlockReason } from "./transaction-mutation-guard";
import type {
  TransactionMutationAction,
  WorkerStartGuard,
} from "./transaction-mutation-guard";

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
  refresh?: boolean;
}

export interface WorkerStartResult {
  status: boolean;
  message: string;
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
  private startGuard: WorkerStartGuard | null = null;
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
    statusPercentage?: number,
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
      statusPercentage?: number,
    ) => void,
    filePath?: string,
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
      this.update.message,
    );
  }

  private schedule() {
    return cron.schedule(
      this.cronExpression,
      () => {
        this.startScheduledWorker();
      },
      {
        timezone: "Etc/UTC",
      },
    );
  }

  private startScheduledWorker() {
    if (this.worker || !this.enabled) {
      return;
    }

    const blockedReason = this.startGuard?.();
    if (blockedReason) {
      this.logger.log(
        "info",
        `Scheduled ${this.display} start skipped because ${blockedReason}`,
      );
      return;
    }

    this.startWorker();
  }

  public setStartGuard(startGuard: WorkerStartGuard) {
    this.startGuard = startGuard;
  }

  protected getWorkerUnavailableReason(): string | null {
    if (this.worker || this.isRunning()) {
      return `${this.display} worker is already running`;
    }
    if (!this.enabled) {
      return `${this.display} worker is disabled`;
    }
    return null;
  }

  protected getStartBlockReason(): string | null {
    const unavailableReason = this.getWorkerUnavailableReason();
    if (unavailableReason) {
      return unavailableReason;
    }
    const blockedReason = this.startGuard?.();
    return blockedReason
      ? `${this.display} worker cannot start while ${blockedReason}. Try again after it finishes.`
      : null;
  }

  public manualStart(): WorkerStartResult {
    const blockedReason = this.getStartBlockReason();
    if (blockedReason) {
      return {
        status: false,
        message: blockedReason,
      };
    }
    this.startWorker();
    return {
      status: true,
      message: `${this.display} worker started`,
    };
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

    Logger.log(
      `[${this.namespace}] Starting scheduled task execution at ${this.filePath}`,
    );

    // Path to the compiled worker script
    const workerPath = path.join(__dirname, this.filePath);

    // Create a new worker thread for each scheduled execution
    this.worker = new Worker(workerPath, {
      workerData,
    });

    this.worker.on("message", (message: CoreWorkerMessage) => {
      if (message.log) {
        if (message.log.level === "error") {
          Logger.error(`[${this.namespace}]`, ...message.log.args);
        }
        this.logger.log(message.log.level, ...message.log.args);
      } else if (message.update) {
        this.update = message.update;
        this.postWorkerUpdate(
          this.namespace,
          this.update.status,
          this.update.message,
          this.update.action,
          this.update.statusPercentage,
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

  public isEnabled(): boolean {
    return this.enabled;
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

  public async terminate() {
    this.task?.stop();
    return await this.manualStop();
  }

  public async manualStop() {
    await this.worker?.terminate();
    this.worker?.removeAllListeners();
    this.worker = null;
    this.update.status = ScheduledWorkerStatus.STOPPED;
    this.update.message = "Worker stopped";
    this.postWorkerUpdate(
      this.namespace,
      this.update.status,
      this.update.message,
      "",
      this.update.statusPercentage,
    );

    return {
      status: true,
      message: "Worker stopped",
    };
  }
}

export class TransactionsScheduledWorker extends ScheduledWorker {
  private mutationGuard: WorkerStartGuard | null = null;

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
      statusPercentage?: number,
    ) => void,
    filePath?: string,
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
      filePath,
    );
  }

  public setMutationGuard(mutationGuard: WorkerStartGuard) {
    this.mutationGuard = mutationGuard;
  }

  private getMutationBlockReason(
    action: TransactionMutationAction,
  ): string | null {
    return getTransactionMutationBlockReason(
      action,
      this.getWorkerUnavailableReason(),
      this.mutationGuard,
    );
  }

  public async resetToBlock(block: number) {
    const blockedReason = this.getMutationBlockReason("reset");
    if (blockedReason) {
      return {
        status: false,
        message: blockedReason,
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
    const blockedReason = this.getMutationBlockReason("recalculate-owners");
    if (blockedReason) {
      return {
        status: false,
        message: blockedReason,
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
      statusPercentage?: number,
    ) => void,
    filePath?: string,
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
      filePath,
    );
  }

  private async startResettableRun(
    flag: "reset" | "refresh",
    startedMessage: string,
  ) {
    const blockedReason = this.getStartBlockReason();
    if (blockedReason) {
      return {
        status: false,
        message: blockedReason,
      };
    }

    const workerData: ResettableWorkerData = {
      rpcUrl: this.rpcUrl,
      dbParams: getBaseDbParams(),
      blockRange: this.blockRange,
      maxConcurrentRequests: this.maxConcurrentRequests,
      [flag]: true,
    } as ResettableWorkerData;

    this.startWorker(workerData);

    return {
      status: true,
      message: startedMessage,
    };
  }

  public async reset() {
    return this.startResettableRun("reset", "Reset started");
  }

  public async fullRefresh() {
    return this.startResettableRun("refresh", "Full refresh started");
  }
}
