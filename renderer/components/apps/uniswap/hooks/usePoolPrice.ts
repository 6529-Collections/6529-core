import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethersv5";
import { Token, TokenPair } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { RPC_URLS } from "../constants";
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
      const provider = new ethers.providers.JsonRpcProvider(
        RPC_URLS[chain.id as keyof typeof RPC_URLS] || RPC_URLS[1]
      );

      const poolContract = new ethers.Contract(
        pair.poolAddress,
        UNISWAP_V3_POOL_ABI,
        provider
      );

      const [slot0, token0Address] = await Promise.all([
        poolContract.slot0(),
        poolContract.token0(),
      ]);

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
        throw new Error("Token not found in pool");
      }

      setPriceData({
        forward: adjustedPrice.toString(),
        reverse: (1 / adjustedPrice).toString(),
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("Error fetching price:", err);
      setPriceData({
        forward: null,
        reverse: null,
        loading: false,
        error: `Failed to fetch price on ${chain.name}`,
      });
    }
  }, [pair, chain]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return priceData;
}
