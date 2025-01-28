import { CurrencyAmount, Token as SDKToken, Currency } from "@uniswap/sdk-core";
import { CHAIN_TOKENS } from "./constants";

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  isNative?: boolean;
  isWrapped?: boolean;
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
  useWETH?: boolean;
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
  if (token.isNative) {
    // Use WETH for SDK operations
    const weth = CHAIN_TOKENS[chainId as keyof typeof CHAIN_TOKENS].WETH;
    return new SDKToken(
      chainId,
      weth.address,
      weth.decimals,
      weth.symbol,
      weth.name
    );
  }
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

// Add utility function to get wrapped version of token
export function getWrappedToken(token: Token, chainId: number): Token {
  if (token.isNative) {
    return CHAIN_TOKENS[chainId as keyof typeof CHAIN_TOKENS].WETH;
  }
  return token;
}

// Add utility function to get display version of token
export function getDisplayToken(token: Token, chainId: number): Token {
  if (token.isWrapped) {
    return CHAIN_TOKENS[chainId as keyof typeof CHAIN_TOKENS].ETH;
  }
  return token;
}
