import { ethers } from "ethers";
import { parentPort, workerData } from "worker_threads";
import {
  MEMES_CONTRACT,
  MEMES_ABI,
  MEMELAB_CONTRACT,
} from "../../../../shared/abis/memes";
import { WorkerData } from "../../scheduled-worker";
import { DataSourceOptions } from "typeorm";
import { logInfo, sendStatusUpdate } from "../../worker-helpers";
import { NFT } from "../../../db/entities/INFT";
import { persistNfts } from "./nfts-worker.db";
import { Time } from "../../../../shared/time";
import {
  Contract,
  ContractType,
  getEditionSizes,
  getTokenUri,
  retrieveNftFromURI,
} from "./nft-worker";
import { CoreWorker } from "../core-worker";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import {
  GRADIENT_CONTRACT,
  GRADIENT_ABI,
} from "../../../../shared/abis/gradient";
import { NEXTGEN_CONTRACT, NEXTGEN_ABI } from "../../../../shared/abis/nextgen";
import { Transaction } from "../../../db/entities/ITransaction";

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
      Transaction,
    ]);
  }

  async work() {
    const contracts: Contract[] = [
      {
        name: "The Memes",
        address: MEMES_CONTRACT,
        abi: MEMES_ABI,
        type: ContractType.ERC1155,
      },
      {
        name: "6529 Gradient",
        address: GRADIENT_CONTRACT,
        abi: GRADIENT_ABI,
        type: ContractType.ERC721,
      },
      {
        name: "Meme Lab",
        address: MEMELAB_CONTRACT,
        abi: MEMES_ABI,
        type: ContractType.ERC1155,
      },
      {
        name: "NextGen",
        address: NEXTGEN_CONTRACT,
        abi: NEXTGEN_ABI,
        type: ContractType.ERC721,
      },
    ];

    for (const contract of contracts) {
      await this.processContract(contract);
    }
  }

  async processContract(contract: Contract) {
    const ethersContract = new ethers.Contract(
      contract.address,
      contract.abi,
      this.getProvider()
    );

    const existingNfts = await this.getDb()
      .getRepository(NFT)
      .find({
        where: {
          contract: contract.address,
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
          message: `[${contract.name}] Processing NFT`,
          progress: nft.id,
          action: "- Reading from chain",
        },
      });
      const uri = await getTokenUri(contract.type, ethersContract, nft.id);
      const editionSizes = await getEditionSizes(
        this.getDb(),
        contract.address,
        ethersContract,
        nft.id
      );
      let updatedNft: NFT | undefined = undefined;
      if (
        editionSizes.editionSize !== nft.edition_size ||
        editionSizes.burnt !== nft.burns
      ) {
        updatedNft = {
          ...nft,
          edition_size: editionSizes.editionSize,
          burns: editionSizes.burnt,
        };
      }
      if (uri && uri != nft.uri) {
        sendStatusUpdate(parentPort, {
          update: {
            status: ScheduledWorkerStatus.RUNNING,
            message: `[${contract.name}] Processing NFT`,
            progress: nft.id,
            action: "- Retrieving Metadata",
          },
        });
        updatedNft = await retrieveNftFromURI(
          this.getDb(),
          contract.address,
          nft.id,
          uri,
          editionSizes
        );
      }
      if (updatedNft) {
        updatedNfts.push(updatedNft);
      }
    }

    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: `Updating Database`,
      },
    });

    logInfo(parentPort, "Updating Database");
    await persistNfts(this.getDb(), updatedNfts);

    logInfo(parentPort, "Finished successfully");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()}`,
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
