export interface ISeedWallet {
  name: string;
  address: string;
  mnemonic: string;
  private_key: string;
}

export enum BROWSER_CONNECTOR {
  CHROME,
  FIREFOX,
  BRAVE,
}
