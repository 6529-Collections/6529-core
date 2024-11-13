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
  RUNNING,
  COMPLETED,
  THROTTLED,
  ERROR,
}

export enum ScheduledWorkerNames {
  TRANSACTIONS_WORKER = "transactions-worker",
  NFT_DELEGATION_WORKER = "nftdelegation-worker",
  NFT_DISCOVERY_WORKER = "nft-discovery-worker",
  NFT_REFRESH_WORKER = "nft-refresh-worker",
  TDH_WORKER = "tdh-worker",
}

export enum ScheduledWorkerDisplay {
  TRANSACTIONS_WORKER = "Transactions",
  NFT_DELEGATION_WORKER = "NFTDelegation",
  NFT_DISCOVERY_WORKER = "NFT Discovery",
  NFT_REFRESH_WORKER = "NFT Refresh",
  TDH_WORKER = "TDH",
}

export enum TransactionsWorkerScope {
  REBALANCE_OWNERS,
  RESET_TO_BLOCK,
}

export const TRANSACTIONS_START_BLOCK = 13360860;
