import { useState, useEffect, useCallback, useMemo } from "react";
import { usePublicClient } from "wagmi";
import { TokenPair } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { Address, ContractFunctionExecutionError } from "viem";
import { Pool } from "@uniswap/v3-sdk";
import { Token as UniswapToken } from "@uniswap/sdk-core";
import { toSDKToken, formatTokenAmount } from "../utils/tokenUtils";
import { CHAIN_TOKENS } from "../constants";

export interface PoolPriceData {
  forward: string | null;
  reverse: string | null;
  loading: boolean;
  error: string | null;
  pool: Pool | null;
}

// Helper function to sort tokens
function sortTokens(
  tokenA: UniswapToken,
  tokenB: UniswapToken
): [UniswapToken, UniswapToken] {
  return tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];
}

/**
 * Custom hook to fetch and calculate real-time prices from a Uniswap V3 pool
 * @param pair The token pair to get prices for
 * @returns PoolPriceData containing forward and reverse prices, loading state, and error if any
 */
export function usePoolPrice(pair: TokenPair | null): PoolPriceData {
  const publicClient = usePublicClient();
  const [priceData, setPriceData] = useState<PoolPriceData>({
    forward: null,
    reverse: null,
    loading: false,
    error: null,
    pool: null,
  });

  // Convert tokens to Uniswap SDK format
  const tokens = useMemo(() => {
    if (!pair) return null;
    try {
      let token0 = toSDKToken(pair.inputToken);
      let token1 = toSDKToken(pair.outputToken);

      // If either token is native ETH, use WETH instead for pool calculations
      if (pair.inputToken.isNative) {
        token0 = toSDKToken(CHAIN_TOKENS[pair.inputToken.chainId].WETH);
      }
      if (pair.outputToken.isNative) {
        token1 = toSDKToken(CHAIN_TOKENS[pair.outputToken.chainId].WETH);
      }

      // Ensure tokens are UniswapToken instances
      if (
        !(token0 instanceof UniswapToken) ||
        !(token1 instanceof UniswapToken)
      ) {
        throw new Error("Invalid token conversion");
      }

      return { token0, token1 };
    } catch (err) {
      console.error("Error converting tokens:", err);
      return null;
    }
  }, [pair]);

  // Format price considering token decimals
  const formatPrice = useCallback(
    (price: { toSignificant: (decimals: number) => string }): string => {
      try {
        const rawPrice = parseFloat(price.toSignificant(6));
        return formatTokenAmount(
          rawPrice,
          Math.max(
            pair?.inputToken.decimals || 18,
            pair?.outputToken.decimals || 18
          )
        );
      } catch (err) {
        console.error("Error formatting price:", err);
        return "0";
      }
    },
    [pair]
  );

  // Fetch pool data and calculate prices
  const fetchPoolPrice = useCallback(async () => {
    if (!pair?.poolAddress || !publicClient || !tokens) {
      setPriceData((prev) => ({ ...prev, error: "Missing required data" }));
      return;
    }

    setPriceData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const poolContract = {
        address: pair.poolAddress as Address,
        abi: UNISWAP_V3_POOL_ABI,
      };

      // Type-safe contract reads
      const [slot0Result, liquidityResult, token0AddressResult] =
        await Promise.all([
          publicClient.readContract({
            ...poolContract,
            functionName: "slot0",
          }) as Promise<
            [bigint, number, number, number, number, number, boolean]
          >,
          publicClient.readContract({
            ...poolContract,
            functionName: "liquidity",
          }) as Promise<bigint>,
          publicClient.readContract({
            ...poolContract,
            functionName: "token0",
          }) as Promise<Address>,
        ]);

      // Extract slot0 data with proper typing
      const [sqrtPriceX96, tick] = slot0Result;

      // Sort tokens according to their addresses
      const [token0, token1] = sortTokens(tokens.token0, tokens.token1);

      // Create pool instance with sorted tokens
      const pool = new Pool(
        token0,
        token1,
        pair.fee,
        sqrtPriceX96.toString(),
        liquidityResult.toString(),
        tick
      );

      // Calculate prices using SDK
      const token0Price = pool.token0Price;
      const token1Price = pool.token1Price;

      // Determine forward and reverse prices based on token order
      const isToken0Input =
        tokens.token0.address.toLowerCase() ===
        token0AddressResult.toLowerCase();

      // Format prices with proper decimal handling
      const forward = formatPrice(isToken0Input ? token0Price : token1Price);
      const reverse = formatPrice(isToken0Input ? token1Price : token0Price);

      setPriceData({
        forward,
        reverse,
        loading: false,
        error: null,
        pool,
      });
    } catch (err) {
      console.error("Error fetching pool price:", err);
      let errorMessage = "Failed to fetch price";

      if (err instanceof ContractFunctionExecutionError) {
        errorMessage = `Contract error: ${err.shortMessage}`;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setPriceData((prev) => ({
        ...prev,
        forward: null,
        reverse: null,
        loading: false,
        error: errorMessage,
        pool: null,
      }));
    }
  }, [pair, publicClient, tokens, formatPrice]);

  // Set up polling interval with cleanup
  useEffect(() => {
    let mounted = true;

    const fetchAndUpdatePrice = async () => {
      if (!mounted) return;
      await fetchPoolPrice();
    };

    fetchAndUpdatePrice();

    if (pair?.poolAddress && publicClient) {
      const interval = setInterval(fetchAndUpdatePrice, 10000);
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }
  }, [fetchPoolPrice, pair?.poolAddress, publicClient]);

  return priceData;
}
