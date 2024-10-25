import { parentPort, workerData } from "worker_threads";
import { WorkerData } from "../../scheduled-worker";
import { CoreWorker } from "../core-worker";
import { ethers } from "ethers";
import {
  MEMES_CONTRACT,
  MEMES_ABI,
  MEMELAB_CONTRACT,
} from "../../../../shared/abis/memes";
import { NFT } from "../../../db/entities/INFT";
import { logInfo, sendStatusUpdate } from "../../worker-helpers";
import {
  Contract,
  ContractType,
  getEditionSizes,
  getTokenUri,
  retrieveNftFromURI,
} from "./nft-worker";
import { persistNfts } from "./nfts-worker.db";
import { Time } from "../../../../shared/time";
import { DataSourceOptions } from "typeorm";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import {
  GRADIENT_CONTRACT,
  GRADIENT_ABI,
} from "../../../../shared/abis/gradient";
import { NEXTGEN_CONTRACT, NEXTGEN_ABI } from "../../../../shared/abis/nextgen";
import { Transaction } from "../../../db/entities/ITransaction";

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
    ];

    for (const contract of contracts) {
      await this.processContract(contract);
    }

    await this.processNextgen();

    logInfo(parentPort, "Completed");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()}`,
      },
    });
  }

  async processContract(contract: Contract) {
    const ethersContract = new ethers.Contract(
      contract.address,
      contract.abi,
      this.getProvider()
    );

    const printStatus = (...args: any[]) => {
      logInfo(parentPort, contract.name, ...args);
    };

    const sendUpdate = (action: string) => {
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: `[${contract.name}]`,
          action,
        },
      });
    };

    let maxNft: { maxId: number } | undefined = await this.getDb()
      .getRepository(NFT)
      .createQueryBuilder("nft")
      .where("nft.contract = :contractAddress", {
        contractAddress: contract.address,
      })
      .select("MAX(nft.id)", "maxId")
      .getRawOne();

    if (!maxNft?.maxId) {
      if (contract.type === ContractType.ERC1155) {
        maxNft = { maxId: 0 };
      } else {
        maxNft = { maxId: -1 };
      }
    }

    printStatus(`Starting index: ${maxNft.maxId}`);
    sendUpdate(`Starting index: ${maxNft.maxId}`);

    let nextId = maxNft.maxId + 1;

    while (true) {
      printStatus(`Checking NFT #${nextId}`);
      const uri = await getTokenUri(contract.type, ethersContract, nextId);

      if (uri && uri != nextId) {
        printStatus(`NFT #${nextId} found`);
        sendUpdate(`New NFT: #${nextId} - Processing`);

        const editionSizes = await getEditionSizes(
          this.getDb(),
          contract.address,
          ethersContract,
          nextId
        );
        printStatus(
          `NFT #${nextId} edition size: ${editionSizes.editionSize}${
            editionSizes.burnt > 0 ? ` (burns: ${editionSizes.burnt})` : ""
          }`
        );

        const newNft = await retrieveNftFromURI(
          this.getDb(),
          contract.address,
          nextId,
          uri,
          editionSizes
        );
        await persistNfts(this.getDb(), [newNft]);
        sendUpdate(`New NFT: #${nextId} - Completed`);
        nextId++;
      } else {
        printStatus(`NFT #${nextId} not found`);
        break;
      }
    }
  }

  async processNextgen() {
    const ethersContract = new ethers.Contract(
      NEXTGEN_CONTRACT,
      NEXTGEN_ABI,
      this.getProvider()
    );

    const printStatus = (...args: any[]) => {
      logInfo(parentPort, `[NextGen]`, ...args);
    };

    const sendUpdate = (action: string) => {
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: `[NextGen]`,
          action,
        },
      });
    };

    let maxNft: { maxId: number } | undefined = await this.getDb()
      .getRepository(NFT)
      .createQueryBuilder("nft")
      .where("nft.contract = :contractAddress", {
        contractAddress: NEXTGEN_CONTRACT,
      })
      .select("MAX(nft.id)", "maxId")
      .getRawOne();

    let collectionIndex = Number(await ethersContract.newCollectionIndex()) - 1;
    printStatus(`Collections Count: ${collectionIndex}`);
    sendUpdate(`Collections Count: ${collectionIndex}`);

    if (!maxNft?.maxId) {
      maxNft = { maxId: 9999999999 };
    }

    printStatus(`Starting index: ${maxNft.maxId}`);
    sendUpdate(`Starting index: ${maxNft.maxId}`);

    let nextId = maxNft.maxId + 1;

    while (collectionIndex > 0) {
      printStatus(`Checking NFT #${nextId}`);
      const uri = await getTokenUri(
        ContractType.ERC721,
        ethersContract,
        nextId
      );

      if (uri && uri != nextId) {
        const collectionId = Math.round(nextId / 10000000000);
        const normalisedTokenId = nextId - collectionId * 10000000000;

        printStatus(`NFT #${nextId} found`);
        sendUpdate(
          `New NFT: Collection ${collectionId} #${normalisedTokenId} - Processing`
        );

        const editionSizes = await getEditionSizes(
          this.getDb(),
          NEXTGEN_CONTRACT,
          ethersContract,
          nextId
        );
        printStatus(
          `NFT #${nextId} edition size: ${editionSizes.editionSize}${
            editionSizes.burnt > 0 ? ` (burnt)` : ""
          }`
        );

        const newNft = await retrieveNftFromURI(
          this.getDb(),
          NEXTGEN_CONTRACT,
          nextId,
          uri,
          editionSizes
        );

        await persistNfts(this.getDb(), [newNft]);
        sendUpdate(
          `New NFT: Collection ${collectionId} #${normalisedTokenId} - Completed`
        );
        nextId++;
      } else {
        nextId = collectionIndex * 10000000000;
        collectionIndex--;
      }
    }
  }
}

new NFTDiscoveryWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests
);
