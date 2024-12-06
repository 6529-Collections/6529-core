import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethersv5";
import { Token, TokenPair } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";

interface PriceData {
  forward: string | null;
  reverse: string | null;
  loading: boolean;
  error: string | null;
}

export function usePoolPrice(pair: TokenPair | null) {
  const [priceData, setPriceData] = useState<PriceData>({
    forward: null,
    reverse: null,
    loading: false,
    error: null,
  });

  const fetchPrice = useCallback(async () => {
    if (!pair) return;

    setPriceData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const provider = new ethers.providers.JsonRpcProvider(
        "https://eth-mainnet.public.blastapi.io"
      );

      const poolContract = new ethers.Contract(
        pair.poolAddress,
        UNISWAP_V3_POOL_ABI,
        provider
      );

      const [slot0, token0] = await Promise.all([
        poolContract.slot0(),
        poolContract.token0(),
      ]);

      const sqrtPriceX96 = BigInt(slot0[0].toString());

      // Calculate price from sqrtPriceX96
      const price =
        (Number(sqrtPriceX96) *
          Number(sqrtPriceX96) *
          10 ** (pair.outputToken.decimals - pair.inputToken.decimals)) /
        2 ** 192;

      // Check if we need to invert the price based on token order
      const isToken0Input =
        token0.toLowerCase() === pair.inputToken.address.toLowerCase();
      const adjustedPrice = isToken0Input ? price : 1 / price;

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
        error: "Failed to fetch price",
      });
    }
  }, [pair]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return priceData;
}
