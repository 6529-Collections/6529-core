import { parentPort, workerData } from "worker_threads";
import { WorkerData } from "../../scheduled-worker";
import { CoreWorker } from "../core-worker";
import { ethers } from "ethers";
import { MEMES_CONTRACT, MEMES_ABI } from "../../../../shared/abis/memes";
import { NFT } from "../../../db/entities/INFT";
import { logInfo, sendStatusUpdate } from "../../worker-helpers";
import { retrieveNftFromURI } from "./nft-worker";
import { persistNfts } from "./nfts-worker.db";
import { Time } from "../../../../shared/time";
import { DataSourceOptions } from "typeorm";
import { ScheduledWorkerStatus } from "../../../../shared/types";

const data: WorkerData = workerData;

export const NAMESPACE = "NFT_DISCOVERY_WORKER >";

class NFTDiscoveryWorker extends CoreWorker {
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

    const maxId: { maxId: number } | undefined = await this.getDb()
      .getRepository(NFT)
      .createQueryBuilder("nft")
      .select("MAX(nft.id)", "maxId")
      .getRawOne();

    if (!maxId) {
      logInfo(parentPort, "NFTs not found");
      throw new Error("NFTs not found");
    }

    logInfo(parentPort, `Latest NFT in database: ${maxId.maxId}`);
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: `Latest NFT in database: ${maxId.maxId}`,
      },
    });

    let nextId = maxId.maxId + 1;

    while (true) {
      logInfo(parentPort, `Checking NFT ${nextId}`);
      const uri = await contract.uri(nextId);
      if (uri && uri != nextId) {
        logInfo(parentPort, `NFT ${nextId} found`);
        sendStatusUpdate(parentPort, {
          update: {
            status: ScheduledWorkerStatus.RUNNING,
            message: `New NFT: ${nextId}`,
            action: "- Processing",
          },
        });
        const editionSize = await contract.totalSupply(nextId);
        logInfo(parentPort, `NFT ${nextId} edition size: ${editionSize}`);

        const newNft = await retrieveNftFromURI(
          MEMES_CONTRACT,
          nextId,
          uri,
          editionSize
        );
        await persistNfts(this.getDb(), [newNft]);
        nextId++;
      } else {
        logInfo(parentPort, `NFT ${nextId} not found`);
        break;
      }
    }

    logInfo(parentPort, `Completed - Latest NFT: ${nextId - 1}`);
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toIsoDateTimeString()} - Latest NFT: ${
          nextId - 1
        }`,
      },
    });
  }
}

new NFTDiscoveryWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests
);
