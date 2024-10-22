import { ethers } from "ethers";
import { parentPort, workerData } from "worker_threads";
import { MEMES_CONTRACT, MEMES_ABI } from "../../../../shared/abis/memes";
import { WorkerData } from "../../scheduled-worker";
import { DataSourceOptions } from "typeorm";
import { logInfo, sendStatusUpdate } from "../../worker-helpers";
import { NFT } from "../../../db/entities/INFT";
import { persistNfts } from "./nfts-worker.db";
import { Time } from "../../../../shared/time";
import { retrieveNftFromURI } from "./nft-worker";
import { CoreWorker } from "../core-worker";
import { ScheduledWorkerStatus } from "../../../../shared/types";

const data: WorkerData = workerData;

export const NAMESPACE = "NFT_REFRESH_WORKER >";

export class NftRefreshWorker extends CoreWorker {
  constructor(
    rpcUrl: string,
    dbParams: DataSourceOptions,
    blockRange: number,
    maxConcurrentRequests: number
  ) {
    super(rpcUrl, dbParams, blockRange, maxConcurrentRequests, parentPort, [
      NFT,
    ]);
  }

  async work() {
    const contract = new ethers.Contract(
      MEMES_CONTRACT,
      MEMES_ABI,
      this.getProvider()
    );

    const existingNfts = await this.getDb()
      .getRepository(NFT)
      .find({
        where: {
          contract: MEMES_CONTRACT,
        },
        order: {
          id: "ASC",
        },
      });

    const updatedNfts: NFT[] = [];
    for (const nft of existingNfts) {
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: `Fetching NFT`,
          progress: nft.id,
          action: "- Reading from chain",
        },
      });
      const uri = await contract.uri(nft.id);
      if (uri && uri != nft.uri) {
        sendStatusUpdate(parentPort, {
          update: {
            status: ScheduledWorkerStatus.RUNNING,
            message: `Fetching NFT`,
            progress: nft.id,
            action: "- Retrieving Metadata",
          },
        });
        const editionSize = await contract.totalSupply(nft.id);
        updatedNfts.push(
          await retrieveNftFromURI(MEMES_CONTRACT, nft.id, uri, editionSize)
        );
      }
    }

    await persistNfts(this.getDb(), updatedNfts);

    logInfo(parentPort, "Finished successfully");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toIsoDateTimeString()}`,
      },
    });
  }
}

new NftRefreshWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests
);
