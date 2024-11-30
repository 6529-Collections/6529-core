export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
}

export interface TokenPair {
  inputToken: Token;
  outputToken: Token;
  poolAddress: string;
  fee: number;
}

export interface TokenAmount {
  token: Token;
  amount: string;
}
