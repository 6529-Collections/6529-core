import { parentPort, workerData } from "worker_threads";
import { WorkerData } from "../../scheduled-worker";
import { DataSourceOptions } from "typeorm";
import {
  getBlockTimestamp,
  logInfo,
  sendStatusUpdate,
} from "../../worker-helpers";
import { Time } from "../../../../shared/time";
import { fetchLatestTransactionsBlockForDate } from "./tdh-worker.db";
import { CoreWorker } from "../core-worker";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import { ConsolidatedTDH, TDH, TDHBlock } from "../../../db/entities/ITDH";
import { getLastTDH } from "./tdh-worker.helpers";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { calculateTDH } from "./tdh";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { Consolidation } from "../../../db/entities/IDelegation";
import { NFT } from "../../../db/entities/INFT";
import { getLatestTransactionsBlock } from "../transactions-worker/transactions-worker.db";

const data: WorkerData = workerData;

export const NAMESPACE = "TDH_WORKER >";

class TDHWorker extends CoreWorker {
  constructor(
    rpcUrl: string,
    dbParams: DataSourceOptions,
    blockRange: number,
    maxConcurrentRequests: number
  ) {
    super(rpcUrl, dbParams, blockRange, maxConcurrentRequests, parentPort, [
      TDHBlock,
      TDH,
      ConsolidatedTDH,
      Transaction,
      TransactionBlock,
      NFT,
      NFTOwner,
      Consolidation,
    ]);
  }

  async work() {
    const startTime = Time.now();
    const lastTDHCalc = getLastTDH();
    const block = await fetchLatestTransactionsBlockForDate(
      this.getDb(),
      lastTDHCalc
    );
    await this.validateBlock(block);
    await this.updateTDH(block, lastTDHCalc);

    logInfo(parentPort, "Finished");

    const duration = startTime.diffFromNow().formatAsDuration(true);
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()} (runtime ${duration}) - TDH Block: ${block}`,
      },
    });
  }

  async validateBlock(block: number) {
    const latestTransactionsBlock = await getLatestTransactionsBlock(
      this.getDb()
    );

    if (block > latestTransactionsBlock) {
      throw new Error(
        `Latest block invalid: Latest Transactions Block: ${latestTransactionsBlock} | Latest Chain Block: ${block}`
      );
    }

    logInfo(
      parentPort,
      "Latest block validated",
      "Latest Transactions Block:",
      latestTransactionsBlock,
      "Latest Chain Block:",
      block
    );
  }

  async updateTDH(block: number, lastTDHCalc: Date) {
    logInfo(parentPort, "Time", lastTDHCalc.toLocaleString());
    logInfo(parentPort, "Selected TDH block", block);
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: `Time: ${lastTDHCalc.toLocaleString()} - TDH Block: ${block}`,
        action: "Calculating TDH",
      },
    });

    const blockTimestamp = await getBlockTimestamp(
      parentPort,
      this.getProvider(),
      NAMESPACE,
      block
    );

    await calculateTDH(this.getDb(), block, lastTDHCalc, blockTimestamp);

    return block;
  }
}

new TDHWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests
);
