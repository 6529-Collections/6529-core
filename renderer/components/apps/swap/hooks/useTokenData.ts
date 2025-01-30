import { useEffect, useState } from "react";
import { ethers } from "ethersv5";
import { TokenPair } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { sepolia } from "wagmi/chains";
import { useAccount } from "wagmi";
import { SEPOLIA_RPC } from "../constants";
import { erc20Abi } from "viem";

export function useTokenData(
  pair: TokenPair | null,
  userAddress: string | undefined
) {
  const [price, setPrice] = useState<string | null>(null);
  const { chain } = useAccount();
  const [inputBalance, setInputBalance] = useState<string | null>(null);
  const [outputBalance, setOutputBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!pair || !chain?.id) return;

    const fetchPrice = async () => {
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

        const [slot0, token0Address] = await Promise.all([
          poolContract.slot0(),
          poolContract.token0(),
        ]);

        const sqrtPriceX96 = BigInt(slot0[0].toString());
        const Q96 = BigInt(2 ** 96);

        const price0Per1 = Number(sqrtPriceX96) / Number(Q96);
        const basePrice = price0Per1 * price0Per1;

        const isInputToken0 =
          pair.inputToken.address.toLowerCase() === token0Address.toLowerCase();

        const decimalAdjustment = isInputToken0
          ? 10 ** (pair.outputToken.decimals - pair.inputToken.decimals)
          : 10 ** (pair.inputToken.decimals - pair.outputToken.decimals);

        const price = isInputToken0
          ? basePrice * decimalAdjustment
          : 1 / (basePrice * decimalAdjustment);

        setPrice(price.toFixed(pair.outputToken.decimals));
      } catch (err) {
        console.error("Error fetching price:", err);
        setPrice(null);
      }
    };

    const fetchBalances = async () => {
      if (!userAddress || !chain?.id) return;

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

        // Fetch balances
        const [inputBalance, outputBalance] = await Promise.all([
          pair.inputToken.symbol === "ETH"
            ? provider.getBalance(userAddress)
            : new ethers.Contract(
                pair.inputToken.address,
                erc20Abi,
                provider
              ).balanceOf(userAddress),
          new ethers.Contract(
            pair.outputToken.address,
            erc20Abi,
            provider
          ).balanceOf(userAddress),
        ]);

        setInputBalance(
          ethers.utils.formatUnits(inputBalance, pair.inputToken.decimals)
        );
        setOutputBalance(
          ethers.utils.formatUnits(outputBalance, pair.outputToken.decimals)
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
  }, [pair, userAddress, chain?.id]);

  return {
    price,
    inputBalance,
    outputBalance,
    loading,
  };
}
