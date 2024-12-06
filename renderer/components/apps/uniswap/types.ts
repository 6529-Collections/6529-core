import { CurrencyAmount, Token as SDKToken } from "@uniswap/sdk-core";

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

export interface SwapRoute {
  quote: CurrencyAmount<SDKToken>;
  quoteGasAdjusted: CurrencyAmount<SDKToken>;
  methodParameters?: {
    calldata: string;
    value: string;
  };
  gasPriceWei: string;
}
