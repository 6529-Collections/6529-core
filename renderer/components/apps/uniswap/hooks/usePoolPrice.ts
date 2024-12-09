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
      const Q96 = BigInt(2 ** 96);

      // Determine if we need to invert the price based on token order
      const isToken0Input =
        token0Address.toLowerCase() === pair.inputToken.address.toLowerCase();

      // Calculate price using string operations to maintain precision
      const price = (Number(sqrtPriceX96) * Number(sqrtPriceX96)) / 2 ** 192;

      // Apply decimal adjustment
      const decimalAdjustment =
        10 ** (pair.outputToken.decimals - pair.inputToken.decimals);
      const adjustedPrice = price * decimalAdjustment;

      // Determine final price based on token order
      const finalPrice = isToken0Input ? adjustedPrice : 1 / adjustedPrice;

      setPriceData({
        forward: finalPrice.toString(),
        reverse: (1 / finalPrice).toString(),
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
