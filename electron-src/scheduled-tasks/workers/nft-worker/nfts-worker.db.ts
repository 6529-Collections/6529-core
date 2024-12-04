import { DataSource } from "typeorm";
import { NFT } from "../../../db/entities/INFT";
import { batchUpsert } from "../../worker-helpers";

export const persistNfts = async (
  db: DataSource,
  nfts: NFT[],
  maxRetries: number = 5,
  delayMs: number = 100
) => {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const nftsRepository = db.getRepository(NFT);
      await batchUpsert(nftsRepository, nfts, ["id", "contract"]);
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
