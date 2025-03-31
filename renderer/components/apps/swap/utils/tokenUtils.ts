import {
  Token as UniswapToken,
  Ether,
  NativeCurrency,
} from "@uniswap/sdk-core";
import { Token } from "../types";
import { ChainId } from "@uniswap/sdk-core";

/**
 * Converts our internal Token type to Uniswap SDK Token
 * @param token Internal token representation
 * @returns Uniswap SDK Token instance
 */
export function toSDKToken(token: Token): UniswapToken | NativeCurrency {
  // Handle native ETH
  if (token.isNative) {
    return Ether.onChain(token.chainId as ChainId);
  }

  return new UniswapToken(
    token.chainId as ChainId,
    token.address as string,
    token.decimals,
    token.symbol,
    token.name
  );
}

/**
 * Safely formats a token amount considering decimals
 * @param amount Raw amount as string or number
 * @param decimals Token decimals
 * @returns Formatted amount string
 */
export function formatTokenAmount(
  amount: string | number,
  decimals: number
): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (numAmount < 0.0001) {
    return numAmount.toExponential(4);
  } else if (numAmount < 1) {
    return numAmount.toFixed(Math.min(decimals, 6));
  } else if (numAmount < 1000) {
    return numAmount.toFixed(Math.min(decimals, 4));
  } else {
    return numAmount.toFixed(2);
  }
}

/**
 * Checks if two tokens are the same
 * @param tokenA First token
 * @param tokenB Second token
 * @returns boolean indicating if tokens are the same
 */
export function areTokensEqual(tokenA: Token, tokenB: Token): boolean {
  return (
    tokenA.address.toLowerCase() === tokenB.address.toLowerCase() &&
    tokenA.chainId === tokenB.chainId
  );
}

/**
 * Gets the number of significant digits to display for a token
 * @param token Token to get display decimals for
 * @returns number of decimal places to display
 */
export function getTokenDisplayDecimals(token: Token): number {
  // Stablecoins typically need fewer decimal places
  if (token.decimals <= 6) {
    return 2;
  }
  // Native tokens and most ERC20s
  if (token.decimals === 18) {
    return 4;
  }
  // Default to half the token's decimals, max 6
  return Math.min(Math.floor(token.decimals / 2), 6);
}

/**
 * Validates a token address
 * @param address Token address to validate
 * @returns boolean indicating if address is valid
 */
export function isValidTokenAddress(address: string): boolean {
  // Check if it's a valid Ethereum address
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
