import { DataSource } from "typeorm";
import { NFT } from "../../../db/entities/INFT";
import { parentPort } from "worker_threads";
import { logInfo, sendStatusUpdate } from "../../worker-helpers";
import { ScheduledWorkerStatus } from "../../../../shared/types";

export const persistNfts = async (
  db: DataSource,
  nfts: NFT[],
  maxRetries: number = 5,
  delayMs: number = 100
) => {
  sendStatusUpdate(parentPort, {
    update: {
      status: ScheduledWorkerStatus.RUNNING,
      message: `Updating Database`,
    },
  });
  logInfo(parentPort, "Persisting NFTs");

  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const nftsRepository = db.getRepository(NFT);
      await nftsRepository.upsert(nfts, ["id", "contract"]);
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: `Database Updated`,
        },
      });
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("database is locked")
      ) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(
            `Updating Database failed after ${maxRetries} retries due to database lock.`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      } else {
        throw error;
      }
    }
  }
};
