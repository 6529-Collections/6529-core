import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethersv5";
import { Token, TokenPair } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { RPC_URLS, FALLBACK_RPC_URLS, SupportedChainId } from "../constants";
import { useAccount } from "wagmi";

interface PriceData {
  forward: string | null;
  reverse: string | null;
  loading: boolean;
  error: string | null;
}

export function usePoolPrice(pair: TokenPair | null) {
  const { chain } = useAccount();
  const [priceData, setPriceData] = useState<PriceData>({
    forward: null,
    reverse: null,
    loading: false,
    error: null,
  });

  const fetchPrice = useCallback(async () => {
    if (!pair || !chain) return;

    setPriceData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      let provider;
      try {
        provider = new ethers.providers.JsonRpcProvider(
          RPC_URLS[chain.id as SupportedChainId]
        );
      } catch (error) {
        console.warn("Primary RPC failed, using fallback:", error);
        provider = new ethers.providers.JsonRpcProvider(
          FALLBACK_RPC_URLS[chain.id as SupportedChainId]
        );
      }

      // Verify pool contract exists
      const code = await provider.getCode(pair.poolAddress);
      if (code === "0x") {
        throw new Error(
          `No liquidity pool found for ${pair.inputToken.symbol}/${pair.outputToken.symbol} on ${chain.name}`
        );
      }

      const poolContract = new ethers.Contract(
        pair.poolAddress,
        UNISWAP_V3_POOL_ABI,
        provider
      );

      // Check pool initialization and liquidity
      const [slot0, liquidity, token0Address] = await Promise.all([
        retry(() => poolContract.slot0(), 3),
        retry(() => poolContract.liquidity(), 3),
        retry(() => poolContract.token0(), 3),
      ]);

      if (!slot0) {
        throw new Error(
          `Pool ${pair.inputToken.symbol}/${pair.outputToken.symbol} is not initialized`
        );
      }

      if (liquidity.eq(0)) {
        throw new Error(
          `No liquidity available in ${pair.inputToken.symbol}/${pair.outputToken.symbol} pool`
        );
      }

      const sqrtPriceX96 = BigInt(slot0[0].toString());

      // Get token addresses in lowercase for comparison
      const token0 = token0Address.toLowerCase();
      const inputToken = pair.inputToken.address.toLowerCase();
      const outputToken = pair.outputToken.address.toLowerCase();

      // Calculate the raw sqrt price
      const Q96 = BigInt(2 ** 96);
      const price0Per1 = Number(sqrtPriceX96) / Number(Q96);
      const price = price0Per1 * price0Per1;

      // Determine price based on token order and apply decimal adjustment
      let adjustedPrice: number;
      if (token0 === inputToken) {
        // If input token is token0, price needs to be inverted
        adjustedPrice =
          (1 / price) *
          10 ** (pair.outputToken.decimals - pair.inputToken.decimals);
      } else if (token0 === outputToken) {
        // If input token is token1, use price directly
        adjustedPrice =
          price * 10 ** (pair.outputToken.decimals - pair.inputToken.decimals);
      } else {
        throw new Error(
          `Token mismatch in pool. Expected ${pair.inputToken.symbol} or ${pair.outputToken.symbol}, got different tokens`
        );
      }

      setPriceData({
        forward: adjustedPrice.toString(),
        reverse: (1 / adjustedPrice).toString(),
        loading: false,
        error: null,
      });
    } catch (err: any) {
      console.error("Error fetching price:", err);
      setPriceData({
        forward: null,
        reverse: null,
        loading: false,
        error: err.message || "Failed to fetch price",
      });
    }
  }, [pair, chain]);

  // Add retry helper function
  const retry = async (fn: () => Promise<any>, attempts: number) => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  };

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return priceData;
}
