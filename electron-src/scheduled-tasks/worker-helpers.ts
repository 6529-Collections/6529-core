import { ObjectLiteral } from "typeorm";
import { Repository } from "typeorm";
import { LogLevel } from "./worker-logger";
import { Time } from "../../shared/time";
import { ethers } from "ethers";
import { ScheduledWorkerStatus } from "../../shared/types";

export interface CoreWorkerMessageLog {
  level: LogLevel;
  args: string[];
}

export interface CoreWorkerMessageUpdate {
  status: ScheduledWorkerStatus;
  message: string;
  action?: string;
  statusPercentage?: number;
}

export type CoreWorkerMessage = {
  log?: CoreWorkerMessageLog;
  update?: CoreWorkerMessageUpdate;
} & ({ log: CoreWorkerMessageLog } | { update: CoreWorkerMessageUpdate });

export const sendStatusUpdate = (
  parentPort: any,
  message: CoreWorkerMessage
) => {
  parentPort?.postMessage(message);
};

const logMessage = (parentPort: any, level: LogLevel, ...args: any[]) => {
  const message: CoreWorkerMessage = { log: { level, args } };
  parentPort?.postMessage(message);
};

export const logInfo = (parentPort: any, ...args: any[]) => {
  logMessage(parentPort, "info", ...args);
};

export const logError = (parentPort: any, error: Error) => {
  logMessage(parentPort, "error", error.message, error.stack);
};

export const logWarn = (parentPort: any, ...args: any[]) => {
  logMessage(parentPort, "warn", ...args);
};

export const batchSave = async <T extends ObjectLiteral>(
  repository: Repository<T>,
  entities: T[]
): Promise<void> => {
  const batchSize = 500;
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    await repository.save(batch);
  }
};

export const batchUpsert = async <T extends ObjectLiteral>(
  repository: Repository<T>,
  entities: T[],
  columns: (keyof T)[]
): Promise<void> => {
  const batchSize = 500;
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    await repository.upsert(batch, columns as string[]);
  }
};

export async function getBlockTimestamp(
  parentPort: any,
  provider: ethers.JsonRpcProvider,
  namespace: string,
  blockNumber: number
): Promise<Time> {
  const block = await provider.getBlock(blockNumber);
  if (block) {
    return Time.seconds(block.timestamp);
  }
  logWarn(
    parentPort,
    namespace,
    "[warning]",
    "Block not found for block number:",
    blockNumber
  );
  return Time.now();
}
