import { CurrencyAmount, Token as SDKToken, Currency } from "@uniswap/sdk-core";

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
  sqrtPriceX96: bigint;
  liquidity: bigint;
  tick: number;
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

// Add utility functions for token conversion
export function toSDKToken(token: Token, chainId: number): SDKToken {
  return new SDKToken(
    chainId,
    token.address,
    token.decimals,
    token.symbol,
    token.name
  );
}

export function fromSDKToken(token: SDKToken | Currency): Token {
  if (token instanceof SDKToken) {
    return {
      symbol: token.symbol ?? "",
      name: token.name ?? "",
      address: token.address,
      decimals: token.decimals,
    };
  }
  throw new Error("Cannot convert non-token currency to Token");
}

// Add this interface to types.ts if you want to share it across components
export interface SwapStatus {
  stage:
    | "idle"
    | "approving"
    | "swapping"
    | "confirming"
    | "success"
    | "pending";
  loading: boolean;
  error: string | null;
  hash?: `0x${string}`;
}
