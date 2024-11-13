import { parentPort, workerData } from "worker_threads";
import { WorkerData } from "../../scheduled-worker";
import { DataSourceOptions } from "typeorm";
import {
  getBlockTimestamp,
  logInfo,
  sendStatusUpdate,
} from "../../worker-helpers";
import { Time } from "../../../../shared/time";
import { CoreWorker } from "../core-worker";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import {
  ConsolidatedTDH,
  TDH,
  TDHBlock,
  TDHMerkleRoot,
} from "../../../db/entities/ITDH";
import { getLastTDH } from "./tdh-worker.helpers";
import {
  Transaction,
  TransactionBlock,
} from "../../../db/entities/ITransaction";
import { calculateTDH, findLatestBlockBeforeTimestamp } from "./tdh";
import { NFTOwner } from "../../../db/entities/INFTOwner";
import { Consolidation } from "../../../db/entities/IDelegation";
import { NFT } from "../../../db/entities/INFT";
import { getLatestTransactionsBlock } from "../transactions-worker/transactions-worker.db";
import { Contract, ContractType, getTokenUri } from "../nft-worker/nft-worker";
import { GRADIENT_ABI } from "../../../../shared/abis/gradient";
import { MEMES_ABI } from "../../../../shared/abis/memes";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { GRADIENT_CONTRACT } from "../../../../shared/abis/gradient";
import { NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { NEXTGEN_ABI } from "../../../../shared/abis/nextgen";
import { ethers } from "ethers";

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
      TDHMerkleRoot,
    ]);
  }

  async work() {
    const startTime = Time.now();

    const lastTDHCalc = getLastTDH();
    const blockBefore = await findLatestBlockBeforeTimestamp(
      this.getProvider(),
      lastTDHCalc.getTime() / 1000
    );
    logInfo(parentPort, "Block before", blockBefore.number);
    const block = blockBefore.number;
    await this.validateBlock(block);
    const tdhResult = await this.updateTDH(block, lastTDHCalc);

    logInfo(parentPort, "Finished");

    const duration = startTime.diffFromNow().formatAsDuration(true).trim();
    sendStatusUpdate(parentPort, {
      update: {
        status: ScheduledWorkerStatus.COMPLETED,
        message: `Completed at ${Time.now().toLocaleDateTimeString()} (runtime ${duration}) - TDH Block: ${
          tdhResult.block
        }`,
      },
    });
  }

  async validateBlock(block: number) {
    const latestTransactionsBlock = await getLatestTransactionsBlock(
      this.getDb().manager
    );

    if (block > latestTransactionsBlock) {
      throw new Error(
        `Latest block invalid: Latest Transactions Block: ${latestTransactionsBlock} | TDH Block: ${block}`
      );
    }

    logInfo(
      parentPort,
      "Latest block validated",
      "Latest Transactions Block:",
      latestTransactionsBlock,
      "TDH Block:",
      block
    );

    await this.validateNFTs();
  }

  async validateNFTs() {
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
        name: "Nextgen",
        address: NEXTGEN_CONTRACT,
        abi: NEXTGEN_ABI,
        type: ContractType.ERC721,
      },
    ];

    for (const contract of contracts) {
      const maxNft: { maxId: number } | undefined = await this.getDb()
        .getRepository(NFT)
        .createQueryBuilder("nft")
        .where("nft.contract = :contractAddress", {
          contractAddress: contract.address,
        })
        .select("MAX(nft.id)", "maxId")
        .getRawOne();

      if (!maxNft?.maxId) {
        throw new Error(`No NFTs found for contract ${contract}`);
      }

      const ethersContract = new ethers.Contract(
        contract.address,
        contract.abi,
        this.getProvider()
      );

      const nextId = maxNft.maxId + 1;
      const uri = await getTokenUri(contract.type, ethersContract, nextId);

      if (uri && uri != nextId) {
        throw new Error(
          `Missing NFT: ${contract.name} #${nextId} - Sync to latest NFTs`
        );
      }
      logInfo(parentPort, `NFT ${contract.name} #${nextId} validated`, uri);
    }

    logInfo(parentPort, "NFTs validated");
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

    const tdhResult = await calculateTDH(
      this.getDb(),
      block,
      lastTDHCalc,
      blockTimestamp
    );

    return tdhResult;
  }
}

new TDHWorker(
  data.rpcUrl,
  data.dbParams,
  data.blockRange,
  data.maxConcurrentRequests
);
