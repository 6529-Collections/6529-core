import { useCallback } from "react";
import { ethers } from "ethersv5";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  Token as SDKToken,
  Percent,
  CurrencyAmount,
  TradeType,
} from "@uniswap/sdk-core";
import { Pool, SwapRouter, Trade, Route } from "@uniswap/v3-sdk";
import { TokenPair, toSDKToken } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import {
  CHAIN_ROUTER_ADDRESSES,
  ensureChecksum,
  type SupportedChainId,
} from "../constants";

// Add proper types for contract responses
interface PoolState {
  slot0: {
    sqrtPriceX96: ethers.BigNumber;
    tick: number;
    observationIndex: number;
    observationCardinality: number;
    observationCardinalityNext: number;
    feeProtocol: number;
    unlocked: boolean;
  };
  liquidity: ethers.BigNumber;
  token0: string;
  token1: string;
}

function calculateGasWithBuffer(gas: bigint, bufferPercent: number): bigint {
  return (gas * BigInt(100 + bufferPercent)) / BigInt(100);
}

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const executeSwap = useCallback(
    async (
      pair: TokenPair,
      inputAmount: string,
      slippageTolerance = new Percent(50, 10_000)
    ): Promise<`0x${string}`> => {
      if (!address || !chain?.id || !walletClient || !publicClient) {
        throw new Error("Missing required connection details");
      }

      try {
        // Create provider using publicClient
        const provider = new ethers.providers.Web3Provider(
          publicClient.transport
        );

        // Verify pool exists and has liquidity
        const poolContract = new ethers.Contract(
          pair.poolAddress,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        // Get pool data with retries and proper typing
        const [slot0, liquidity, token0, token1] = await Promise.all([
          retryPromise(() => poolContract.slot0()) as Promise<
            PoolState["slot0"]
          >,
          retryPromise(() =>
            poolContract.liquidity()
          ) as Promise<ethers.BigNumber>,
          retryPromise(() => poolContract.token0()) as Promise<string>,
          retryPromise(() => poolContract.token1()) as Promise<string>,
        ]);

        if (!slot0 || !liquidity || !token0 || !token1) {
          throw new Error("Failed to fetch pool data");
        }

        if (liquidity.isZero()) {
          throw new Error("Pool has no liquidity");
        }

        // For ETH/WETH handling - use the checksummed address from constants
        const WETH_ADDRESS = ensureChecksum(
          chain.id === 1
            ? "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // Mainnet WETH
            : "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" // Sepolia WETH
        );

        const [token0Lower, token1Lower] = [
          token0.toLowerCase(),
          token1.toLowerCase(),
        ];
        const [inputLower, outputLower] = [
          pair.inputToken.address.toLowerCase(),
          pair.outputToken.address.toLowerCase(),
        ];

        const isInputETH = pair.inputToken.symbol === "ETH";
        const isOutputETH = pair.outputToken.symbol === "ETH";
        const inputAddressToCheck = isInputETH
          ? WETH_ADDRESS.toLowerCase()
          : inputLower;
        const outputAddressToCheck = isOutputETH
          ? WETH_ADDRESS.toLowerCase()
          : outputLower;

        // Check if tokens match (in either order)
        const tokensMatch =
          (token0Lower === inputAddressToCheck &&
            token1Lower === outputAddressToCheck) ||
          (token0Lower === outputAddressToCheck &&
            token1Lower === inputAddressToCheck);

        if (!tokensMatch) {
          console.error("Token mismatch:", {
            poolToken0: token0Lower,
            poolToken1: token1Lower,
            inputToken: inputAddressToCheck,
            outputToken: outputAddressToCheck,
            chainId: chain.id,
          });
          throw new Error("Pool tokens do not match the requested pair");
        }

        // Create Pool instance with proper token ordering
        const [token0Sdk, token1Sdk] = [
          toSDKToken(
            isInputETH
              ? { ...pair.inputToken, address: WETH_ADDRESS }
              : pair.inputToken,
            chain.id
          ),
          toSDKToken(
            isOutputETH
              ? { ...pair.outputToken, address: WETH_ADDRESS }
              : pair.outputToken,
            chain.id
          ),
        ];

        const pool = new Pool(
          token0Sdk,
          token1Sdk,
          pair.fee,
          slot0.sqrtPriceX96.toString(),
          liquidity.toString(),
          slot0.tick
        );

        // Parse input amount with proper decimals
        const amountIn = CurrencyAmount.fromRawAmount(
          token0Sdk,
          ethers.utils
            .parseUnits(inputAmount, pair.inputToken.decimals)
            .toString()
        );

        // Create trade with proper route
        const route = new Route([pool], token0Sdk, token1Sdk);
        const trade = await Trade.createUncheckedTrade({
          route,
          inputAmount: amountIn,
          outputAmount: CurrencyAmount.fromRawAmount(token1Sdk, "0"),
          tradeType: TradeType.EXACT_INPUT,
        });

        // Prepare swap parameters with proper deadline
        const options = {
          slippageTolerance,
          deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
          recipient: address,
        };

        // Get swap calldata
        const { calldata, value } = SwapRouter.swapCallParameters(
          [trade],
          options
        );

        // Get router address for the current chain
        const routerAddress =
          CHAIN_ROUTER_ADDRESSES[chain.id as SupportedChainId];
        if (!routerAddress) {
          throw new Error(`No router address found for chain ${chain.id}`);
        }

        // Format addresses and data
        const formattedAddress = routerAddress.toLowerCase().startsWith("0x")
          ? (routerAddress as `0x${string}`)
          : (`0x${routerAddress}` as `0x${string}`);

        const formattedData = calldata.toLowerCase().startsWith("0x")
          ? (calldata as `0x${string}`)
          : (`0x${calldata}` as `0x${string}`);

        // Add proper gas buffer for swaps
        const gasEstimate = await retryPromise(() =>
          publicClient.estimateGas({
            account: address,
            to: formattedAddress,
            data: formattedData,
            value: BigInt(value),
          })
        );

        // Calculate gas buffer using BigInt constructor instead of literals
        const gasWithBuffer = calculateGasWithBuffer(gasEstimate, 20); // 20% buffer

        // Send transaction with proper gas settings
        const hash = await walletClient.sendTransaction({
          to: formattedAddress,
          data: formattedData,
          value: BigInt(value),
          gas: gasWithBuffer,
        });

        return hash;
      } catch (error: any) {
        console.error("Swap execution error:", error);
        throw new Error(
          error.message || "Failed to execute swap. Please try again."
        );
      }
    },
    [address, chain?.id, publicClient, walletClient]
  );

  return { executeSwap };
}

// Utility function for retrying promises
async function retryPromise<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return retryPromise(fn, retries - 1, delay);
  }
}
