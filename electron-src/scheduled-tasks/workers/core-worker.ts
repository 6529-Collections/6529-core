import { ethers } from "ethers";
import { DataSource, DataSourceOptions } from "typeorm";
import { getWorkerDb, initWorkerDb } from "./workers.db";
import { logError, logInfo, sendStatusUpdate } from "../worker-helpers";
import { ScheduledWorkerStatus } from "../../../shared/types";
import Bottleneck from "bottleneck";

export abstract class CoreWorker {
  private provider: ethers.JsonRpcProvider;
  private dbParams: DataSourceOptions;
  private db!: DataSource;
  private blockRange: number;
  private maxConcurrentRequests: number;
  private bottleneck: Bottleneck;
  private parentPort: any;
  private entities: Function[];
  constructor(
    rpcUrl: string,
    dbParams: DataSourceOptions,
    blockRange: number,
    maxConcurrentRequests: number,
    parentPort: any,
    entities: Function[]
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.dbParams = dbParams;
    this.blockRange = blockRange;
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.bottleneck = new Bottleneck({
      maxConcurrent: this.maxConcurrentRequests,
    });
    this.parentPort = parentPort;
    this.entities = entities;
    this.init();
  }

  protected async init() {
    try {
      sendStatusUpdate(this.parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: `Starting`,
        },
      });
      logInfo(this.parentPort, "Initializing database");
      await initWorkerDb(this.dbParams, this.entities);
      logInfo(this.parentPort, "Database initialized");
      this.db = getWorkerDb();
      await this.work();
    } catch (error: any) {
      logError(this.parentPort, error);
      if (error.message.includes('"code": 429')) {
        sendStatusUpdate(this.parentPort, {
          update: {
            status: ScheduledWorkerStatus.THROTTLED,
            message: `Throttled (too many requests per second) - Will retry in next run`,
          },
        });
      } else {
        sendStatusUpdate(this.parentPort, {
          update: {
            status: ScheduledWorkerStatus.ERROR,
            message: `Error - ${error.message}`,
          },
        });
      }
    } finally {
      await this.db?.destroy();
    }
  }

  protected getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  protected getDb(): DataSource {
    return this.db;
  }

  protected getBlockRange(): number {
    return this.blockRange;
  }

  protected setBlockRange(blockRange: number) {
    this.blockRange = blockRange;
  }

  protected getMaxConcurrentRequests(): number {
    return this.maxConcurrentRequests;
  }

  protected getBottleneck(): Bottleneck {
    return this.bottleneck;
  }

  abstract work(): Promise<void>;
}
