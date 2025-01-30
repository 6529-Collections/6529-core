import { CurrencyAmount, Token as SDKToken, Currency } from "@uniswap/sdk-core";
import { CHAIN_TOKENS } from "./constants";
import { getBalance, readContracts } from "wagmi/actions";
import { getWagmiConfig } from "../../../wagmiConfig";
import { erc20Abi } from "viem";

export interface Token {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  logoURI?: string;
  isNative?: boolean;
  isWrapped?: boolean;
  chainId: number;
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
      chainId: token.chainId,
    };
  }
  throw new Error("Cannot convert non-token currency to Token");
}

// Add this interface to types.ts if you want to share it across components
export type TransactionStage =
  | "idle"
  | "approving"
  | "swapping"
  | "confirming"
  | "success"
  | "error"
  | "pending"
  | "complete";

export interface SwapStatus {
  stage: TransactionStage;
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

// Updated getTokenBalance with proper config handling
export async function getTokenBalance(
  token: Token,
  address: string
): Promise<bigint> {
  if (token.isNative) {
    const balance = await getBalance(await getWagmiConfig(), {
      address: address as `0x${string}`,
      chainId: token.chainId,
    });
    return balance.value;
  }

  const result = await readContracts(await getWagmiConfig(), {
    contracts: [
      {
        address: token.address as `0x${string}`,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      },
    ],
  });

  return result[0].result ? BigInt(result[0].result.toString()) : BigInt(0);
}
