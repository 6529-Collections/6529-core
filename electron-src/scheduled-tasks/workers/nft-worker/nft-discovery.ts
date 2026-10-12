import { parentPort, workerData } from "worker_threads";
import { ResettableWorkerData } from "../../scheduled-worker";
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
  getMintDate,
  getTokenUri,
  retrieveNftFromURI,
} from "./nft-worker";
import { withTimeout } from "./nft-request-timeout";
import { persistNfts } from "./nfts-worker.db";
import { Time } from "../../../../shared/time";
import { DataSourceOptions } from "typeorm";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import {
  GRADIENT_CONTRACT,
  GRADIENT_ABI,
} from "../../../../shared/abis/gradient";
import { NEXTGEN_CONTRACT, NEXTGEN_ABI } from "../../../../shared/abis/nextgen";
import { areEqualAddresses } from "../../../../shared/helpers";
import { selectMemeEditionSizeFloorRefreshIds } from "../../../../shared/memes-edition-size-floor";
import { repairNftEditionSizeFloors } from "../../../db/nft-edition-size-floor-repair";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";

const data: ResettableWorkerData = workerData;

const MEMES_CONTRACT_OBJECT: Contract = {
  name: "The Memes",
  address: MEMES_CONTRACT,
  abi: MEMES_ABI,
  type: ContractType.ERC1155,
};
const GRADIENT_CONTRACT_OBJECT: Contract = {
  name: "6529 Gradient",
  address: GRADIENT_CONTRACT,
  abi: GRADIENT_ABI,
  type: ContractType.ERC721,
};
const MEMELAB_CONTRACT_OBJECT: Contract = {
  name: "Meme Lab",
  address: MEMELAB_CONTRACT,
  abi: MEMES_ABI,
  type: ContractType.ERC1155,
};
const NEXTGEN_CONTRACT_OBJECT: Contract = {
  name: "NextGen",
  address: NEXTGEN_CONTRACT,
  abi: NEXTGEN_ABI,
  type: ContractType.ERC721,
};

export const NAMESPACE = "NFTS_WORKER >";

class NFTWorker extends CoreWorker {
  private reset?: boolean;
  private refresh?: boolean;

  constructor(
    rpcUrl: string,
    dbParams: DataSourceOptions,
    blockRange: number,
    maxConcurrentRequests: number,
    reset?: boolean,
    refresh?: boolean,
  ) {
    super(rpcUrl, dbParams, blockRange, maxConcurrentRequests, parentPort, [
      NFT,
      Transaction,
      TransactionBlock,
    ]);
    this.reset = reset;
    this.refresh = refresh;
  }

  async sendStatusMessage() {
    const message = await this.getStatusMessage([
      MEMES_CONTRACT_OBJECT,
      GRADIENT_CONTRACT_OBJECT,
      NEXTGEN_CONTRACT_OBJECT,
      MEMELAB_CONTRACT_OBJECT,
    ]);

    logInfo(parentPort, message);
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message,
      },
    });
  }

  async work() {
    await repairNftEditionSizeFloors(this.getDb());
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    if (this.reset) {
      return await this.resetWork();
    } else if (this.refresh || (currentHour % 2 === 0 && currentMinute === 0)) {
      return await this.refreshWork();
    } else {
      return await this.normalWork();
    }
  }

  private async resetWork() {
    logInfo(parentPort, "Resetting Database");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: "Resetting NFTs",
      },
    });

    await this.getDb().getRepository(NFT).clear();
    await new Promise((resolve) => setTimeout(resolve, 2000));

    logInfo(parentPort, "All NFTs deleted, starting sync...");
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.RUNNING,
        message: "All NFTs deleted, starting sync...",
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return await this.normalWork();
  }

  private async refreshWork() {
    const contracts: Contract[] = [
      MEMES_CONTRACT_OBJECT,
      GRADIENT_CONTRACT_OBJECT,
      MEMELAB_CONTRACT_OBJECT,
      NEXTGEN_CONTRACT_OBJECT,
    ];

    for (const contract of contracts) {
      await this.processContractRefresh(contract);
    }

    await this.sendStatusMessage();
  }

  private async normalWork() {
    const contracts: Contract[] = [
      MEMES_CONTRACT_OBJECT,
      GRADIENT_CONTRACT_OBJECT,
      MEMELAB_CONTRACT_OBJECT,
    ];

    for (const contract of contracts) {
      await this.processContract(contract);
    }

    await this.processNextgen();

    await this.sendStatusMessage();
  }

  async processContract(contract: Contract) {
    const ethersContract = new ethers.Contract(
      contract.address,
      contract.abi,
      this.getProvider(),
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

        const mintDate = await getMintDate(
          this.getDb(),
          contract.address,
          nextId,
        );
        if (mintDate === null) {
          printStatus(
            `NFT #${nextId} is waiting for its transaction to be indexed`,
          );
          sendUpdate(`New NFT: #${nextId} - Waiting for transaction sync`);
          break;
        }

        const editionSizes = await getEditionSizes(
          this.getDb(),
          contract.address,
          ethersContract,
          nextId,
          {
            provider: this.getProvider(),
            refreshEditionSizeFloor: false,
          },
        );
        printStatus(
          `NFT #${nextId} edition size: ${editionSizes.editionSize}${
            editionSizes.burnt > 0 ? ` (burns: ${editionSizes.burnt})` : ""
          }${
            editionSizes.editionSizeFloor !== editionSizes.editionSize
              ? ` (floor: ${editionSizes.editionSizeFloor})`
              : ""
          }`,
        );

        const newNft = await retrieveNftFromURI(
          contract.address,
          nextId,
          uri,
          editionSizes,
          mintDate,
        );
        await persistNfts(this.getDb(), [newNft]);
        sendUpdate(`New NFT: #${nextId} - Completed`);
        nextId++;
      } else {
        printStatus(`NFT #${nextId} not found`);
        break;
      }
    }

    if (areEqualAddresses(contract.address, MEMES_CONTRACT)) {
      await this.refreshMemeEditionSizeFloors(ethersContract, printStatus);
    }
  }

  private async getMemeFloorRefreshIds(
    nfts: NFT[],
    ethersContract: ethers.Contract,
  ) {
    return selectMemeEditionSizeFloorRefreshIds(nfts, (tokenId) =>
      withTimeout(
        ethersContract.uri(tokenId),
        Time.seconds(10).toMillis(),
        `Timed out verifying latest Meme after #${tokenId - 1}`,
      ),
    );
  }

  private async refreshMemeEditionSizeFloors(
    ethersContract: ethers.Contract,
    printStatus: (...args: any[]) => void,
  ) {
    await repairNftEditionSizeFloors(this.getDb());
    const memes = await this.getDb()
      .getRepository(NFT)
      .find({
        where: { contract: MEMES_CONTRACT },
      });
    const refreshIds = new Set(
      await this.getMemeFloorRefreshIds(memes, ethersContract),
    );
    for (const meme of memes.filter((nft) => refreshIds.has(nft.id))) {
      const editionSizes = await getEditionSizes(
        this.getDb(),
        MEMES_CONTRACT,
        ethersContract,
        meme.id,
        { provider: this.getProvider(), refreshEditionSizeFloor: true },
      );
      if (
        meme.edition_size === editionSizes.editionSize &&
        meme.edition_size_floor === editionSizes.editionSizeFloor &&
        meme.burns === editionSizes.burnt
      ) {
        continue;
      }
      await this.getDb().getRepository(NFT).update(
        { contract: meme.contract, id: meme.id },
        {
          edition_size: editionSizes.editionSize,
          edition_size_floor: editionSizes.editionSizeFloor,
          burns: editionSizes.burnt,
        },
      );
      printStatus(
        `Meme #${meme.id} edition size: ${editionSizes.editionSize}, floor ${editionSizes.editionSizeFloor}, burns ${editionSizes.burnt}`,
      );
    }
  }

  async processNextgen() {
    const ethersContract = new ethers.Contract(
      NEXTGEN_CONTRACT,
      NEXTGEN_ABI,
      this.getProvider(),
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
        nextId,
      );

      if (uri && uri != nextId) {
        const collectionId = Math.round(nextId / 10000000000);
        const normalisedTokenId = nextId - collectionId * 10000000000;

        printStatus(`NFT #${nextId} found`);
        sendUpdate(
          `New NFT: Collection ${collectionId} #${normalisedTokenId} - Processing`,
        );

        const mintDate = await getMintDate(
          this.getDb(),
          NEXTGEN_CONTRACT,
          nextId,
        );
        if (mintDate === null) {
          printStatus(
            `NFT #${nextId} is waiting for its transaction to be indexed`,
          );
          sendUpdate(
            `New NFT: Collection ${collectionId} #${normalisedTokenId} - Waiting for transaction sync`,
          );
          break;
        }

        const editionSizes = await getEditionSizes(
          this.getDb(),
          NEXTGEN_CONTRACT,
          ethersContract,
          nextId,
          {
            provider: this.getProvider(),
            refreshEditionSizeFloor: false,
          },
        );
        printStatus(
          `NFT #${nextId} edition size: ${editionSizes.editionSize}${
            editionSizes.burnt > 0 ? ` (burnt)` : ""
          }`,
        );

        const newNft = await retrieveNftFromURI(
          NEXTGEN_CONTRACT,
          nextId,
          uri,
          editionSizes,
          mintDate,
        );

        await persistNfts(this.getDb(), [newNft]);
        sendUpdate(
          `New NFT: Collection ${collectionId} #${normalisedTokenId} - Completed`,
        );
        nextId++;
      } else {
        nextId = collectionIndex * 10000000000;
        collectionIndex--;
      }
    }
  }

  async processContractRefresh(contract: Contract) {
    const ethersContract = new ethers.Contract(
      contract.address,
      contract.abi,
      this.getProvider(),
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
    const refreshEditionSizeFloorTokenIds = new Set(
      areEqualAddresses(contract.address, MEMES_CONTRACT)
        ? await this.getMemeFloorRefreshIds(existingNfts, ethersContract)
        : [],
    );

    const updatedNfts: NFT[] = [];
    for (const nft of existingNfts) {
      sendStatusUpdate(parentPort, {
        update: {
          status: ScheduledWorkerStatus.RUNNING,
          message: `[${contract.name} Refresh] Processing NFT #${nft.id}`,
          action: "- Reading from chain",
        },
      });
      const mintDate = await getMintDate(
        this.getDb(),
        contract.address,
        nft.id,
      );
      const resolvedMintDate = mintDate ?? nft.mint_date;
      if (mintDate === null) {
        logInfo(
          parentPort,
          `[${contract.name} Refresh] NFT #${nft.id} has no indexed transaction; preserving its existing mint date while refreshing chain data`,
        );
      }

      const uri = await getTokenUri(contract.type, ethersContract, nft.id);
      const editionSizes = await getEditionSizes(
        this.getDb(),
        contract.address,
        ethersContract,
        nft.id,
        {
          provider: this.getProvider(),
          refreshEditionSizeFloor: refreshEditionSizeFloorTokenIds.has(nft.id),
        },
      );
      const isChanged =
        editionSizes.editionSize !== nft.edition_size ||
        editionSizes.editionSizeFloor !== nft.edition_size_floor ||
        editionSizes.burnt !== nft.burns ||
        resolvedMintDate !== nft.mint_date;

      if ((uri && uri != nft.uri) || isChanged) {
        sendStatusUpdate(parentPort, {
          update: {
            status: ScheduledWorkerStatus.RUNNING,
            message: `[${contract.name} Refresh] Processing NFT #${nft.id}`,
            action: "- Retrieving Metadata",
          },
        });
        const updatedNft = await retrieveNftFromURI(
          contract.address,
          nft.id,
          uri,
          editionSizes,
          resolvedMintDate,
        );
        updatedNft.tdh = nft.tdh;
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

  private async getStatusMessage(contracts: Contract[]) {
    let message = "";
    for (const contract of contracts) {
      const contractCount = await this.getDb()
        .getRepository(NFT)
        .count({
          where: {
            contract: contract.address,
          },
        });
      if (message) {
        message += " / ";
      }
      message += `${contract.name}: ${contractCount.toLocaleString()}`;
    }

    return message;
  }
}

new NFTWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests,
  data.reset,
  data.refresh,
);
