import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethersv5";
import { TokenPair } from "../types";
import { useAccount } from "wagmi";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { sepolia } from "wagmi/chains";
import { SEPOLIA_RPC } from "../constants";

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
      let provider: ethers.providers.Provider;

      if (chain.id === sepolia.id) {
        provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC, {
          chainId: chain.id,
          name: "sepolia",
        });
      } else {
        provider = new ethers.providers.CloudflareProvider();
      }
      const poolContract = new ethers.Contract(
        pair.poolAddress,
        UNISWAP_V3_POOL_ABI,
        provider
      );

      // Get pool data
      const [slot0, token0Address] = await Promise.all([
        poolContract.slot0(),
        poolContract.token0(),
      ]);

      const sqrtPriceX96 = BigInt(slot0[0].toString());
      const Q96 = BigInt(2 ** 96);

      // Calculate raw price (token1 in terms of token0)
      const price0Per1 = Number(sqrtPriceX96) / Number(Q96);
      const basePrice = price0Per1 * price0Per1;

      // Determine if our input token is token0 or token1 in the pool
      const isInputToken0 =
        pair.inputToken.address.toLowerCase() === token0Address.toLowerCase();

      // Apply decimal adjustment
      const decimalAdjustment = isInputToken0
        ? 10 ** (pair.outputToken.decimals - pair.inputToken.decimals)
        : 10 ** (pair.inputToken.decimals - pair.outputToken.decimals);

      // If input token is token0, we use the price directly
      // If input token is token1, we need to use the inverse
      const forwardPrice = isInputToken0
        ? basePrice * decimalAdjustment
        : 1 / (basePrice * decimalAdjustment);
      const reversePrice = 1 / forwardPrice;

      setPriceData({
        forward: forwardPrice.toString(),
        reverse: reversePrice.toString(),
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

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return priceData;
}
