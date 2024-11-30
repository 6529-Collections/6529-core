import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { TokenPair } from "../types";
import { ERC20_ABI, UNISWAP_V3_POOL_ABI } from "../abis";

export function useTokenData(
  pair: TokenPair | null,
  userAddress: string | undefined
) {
  const [price, setPrice] = useState<string | null>(null);
  const [inputBalance, setInputBalance] = useState<string | null>(null);
  const [outputBalance, setOutputBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pair) return;

    const fetchPrice = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(
          "https://eth-mainnet.public.blastapi.io"
        );

        const poolContract = new ethers.Contract(
          pair.poolAddress,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        const slot0 = await poolContract.slot0();
        const sqrtPriceX96 = BigInt(slot0[0].toString());
        const Q96 = BigInt(2 ** 96);

        const decimalsAdjustment = BigInt(
          10 ** (pair.outputToken.decimals - pair.inputToken.decimals)
        );
        const priceValue = Number(
          (decimalsAdjustment * (Q96 * Q96)) / (sqrtPriceX96 * sqrtPriceX96)
        );

        setPrice(priceValue.toFixed(pair.outputToken.decimals));
      } catch (err) {
        console.error("Error fetching price:", err);
        setPrice(null);
      }
    };

    const fetchBalances = async () => {
      if (!userAddress) {
        setInputBalance(null);
        setOutputBalance(null);
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(
          "https://eth-mainnet.public.blastapi.io"
        );

        // Fetch balances
        const [inputBalance, outputBalance] = await Promise.all([
          pair.inputToken.symbol === "ETH"
            ? provider.getBalance(userAddress)
            : new ethers.Contract(
                pair.inputToken.address,
                ERC20_ABI,
                provider
              ).balanceOf(userAddress),
          new ethers.Contract(
            pair.outputToken.address,
            ERC20_ABI,
            provider
          ).balanceOf(userAddress),
        ]);

        setInputBalance(
          ethers.formatUnits(inputBalance, pair.inputToken.decimals)
        );
        setOutputBalance(
          ethers.formatUnits(outputBalance, pair.outputToken.decimals)
        );
      } catch (err) {
        console.error("Error fetching balances:", err);
        setInputBalance(null);
        setOutputBalance(null);
      }
    };

    fetchPrice();
    fetchBalances();

    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [pair, userAddress]);

  return {
    price,
    inputBalance,
    outputBalance,
    loading,
  };
}
