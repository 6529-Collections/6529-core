import { useEffect, useState } from "react";
import { TokenPair } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { useAccount, usePublicClient } from "wagmi";
import { getContract, formatUnits, type Address, erc20Abi } from "viem";

interface Slot0Response {
  sqrtPriceX96: bigint;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

export function useTokenData(
  pair: TokenPair | null,
  userAddress: string | undefined
) {
  const [price, setPrice] = useState<string | null>(null);
  const { chain } = useAccount();
  const publicClient = usePublicClient();
  const [inputBalance, setInputBalance] = useState<string | null>(null);
  const [outputBalance, setOutputBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pair || !chain?.id || !publicClient) return;

    const fetchPrice = async () => {
      try {
        const poolContract = getContract({
          address: pair.poolAddress as Address,
          abi: UNISWAP_V3_POOL_ABI,
          client: publicClient,
        });

        const [slot0Data, token0Address] = await Promise.all([
          poolContract.read.slot0() as Promise<Slot0Response>,
          poolContract.read.token0() as Promise<Address>,
        ]);

        const sqrtPriceX96 = slot0Data.sqrtPriceX96;
        const Q96 = BigInt(Math.pow(2, 96));
        const scaleFactor = BigInt(10000);

        // Calculate raw price using BigInt operations
        const priceRatio = (sqrtPriceX96 * scaleFactor) / Q96;
        const price0Per1 = Number(priceRatio) / Number(scaleFactor);
        const basePrice = price0Per1 * price0Per1;

        const isInputToken0 =
          pair.inputToken.address.toLowerCase() === token0Address.toLowerCase();

        const decimalAdjustment = isInputToken0
          ? 10 ** (pair.outputToken.decimals - pair.inputToken.decimals)
          : 10 ** (pair.inputToken.decimals - pair.outputToken.decimals);

        const finalPrice = isInputToken0
          ? basePrice * decimalAdjustment
          : 1 / (basePrice * decimalAdjustment);

        setPrice(finalPrice.toFixed(pair.outputToken.decimals));
      } catch (err) {
        console.error("Error fetching price:", err);
        setPrice(null);
      }
    };

    const fetchBalances = async () => {
      if (!userAddress || !chain?.id || !publicClient) return;

      try {
        setLoading(true);

        // Fetch balances
        const balancePromises = [];

        // Handle native ETH balance
        if (pair.inputToken.symbol === "ETH") {
          balancePromises.push(
            publicClient.getBalance({ address: userAddress as Address })
          );
        } else {
          const inputTokenContract = getContract({
            address: pair.inputToken.address as Address,
            abi: erc20Abi,
            client: publicClient,
          });
          balancePromises.push(
            inputTokenContract.read.balanceOf([userAddress as Address])
          );
        }

        // Handle output token balance
        const outputTokenContract = getContract({
          address: pair.outputToken.address as Address,
          abi: erc20Abi,
          client: publicClient,
        });
        balancePromises.push(
          outputTokenContract.read.balanceOf([userAddress as Address])
        );

        const [inputBalanceRaw, outputBalanceRaw] = await Promise.all(
          balancePromises
        );

        setInputBalance(formatUnits(inputBalanceRaw, pair.inputToken.decimals));
        setOutputBalance(
          formatUnits(outputBalanceRaw, pair.outputToken.decimals)
        );
      } catch (err) {
        console.error("Error fetching balances:", err);
        setInputBalance(null);
        setOutputBalance(null);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    fetchBalances();

    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, [pair, userAddress, chain?.id, publicClient]);

  return {
    price,
    inputBalance,
    outputBalance,
    loading,
  };
}
