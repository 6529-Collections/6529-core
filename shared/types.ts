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
