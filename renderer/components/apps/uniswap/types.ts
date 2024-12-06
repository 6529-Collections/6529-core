import { CurrencyAmount, Token as SDKToken } from "@uniswap/sdk-core";

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
}

export interface PoolData {
  address: string;
  fee: number;
  token0: Token;
  token1: Token;
  sqrtPriceX96?: bigint;
  liquidity?: bigint;
  tick?: number;
}

export interface TokenPair {
  inputToken: Token;
  outputToken: Token;
  poolAddress: string;
  fee: number;
  poolData?: PoolData;
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
