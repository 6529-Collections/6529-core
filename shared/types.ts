export interface ISeedWallet {
  name: string;
  address: string;
  address_hashed: string;
  mnemonic: string;
  private_key: string;
  imported: boolean;
}

export enum BROWSER_CONNECTOR {
  CHROME,
  FIREFOX,
  BRAVE,
}

export interface SeedWalletRequest {
  requestId: string;
  from: string;
  method: string;
  params: any[];
  privateKey?: string;
}

export enum ScheduledWorkerStatus {
  IDLE,
  DISABLED,
  STARTING,
  RUNNING,
  COMPLETED,
  THROTTLED,
  ERROR,
}

export enum ScheduledWorkerNames {
  TRANSACTIONS_WORKER = "transactions-worker",
  NFT_DELEGATION_WORKER = "nftdelegation-worker",
  NFTS_WORKER = "nfts-worker",
  TDH_WORKER = "tdh-worker",
}

export enum ScheduledWorkerDisplay {
  TRANSACTIONS_WORKER = "Transactions",
  NFT_DELEGATION_WORKER = "NFTDelegation",
  NFTS_WORKER = "NFTs",
  TDH_WORKER = "TDH",
}

export enum TransactionsWorkerScope {
  RECALCULATE_OWNERS,
  RESET_TO_BLOCK,
}

export const TRANSACTIONS_START_BLOCK = 13360860;

export interface LogLine {
  id: number;
  content: string;
}
