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

  const retryPromise = async <T>(
    fn: () => Promise<T>,
    attempts = 3
  ): Promise<T> => {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error: any) {
        console.error(`Attempt ${i + 1} failed:`, {
          error,
          message: error.message,
          reason: error.reason,
          code: error.code,
        });
        if (i === attempts - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error("Max retry attempts reached");
  };

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
        // Debug: Log initial swap parameters
        console.log("Swap Parameters:", {
          chainId: chain.id,
          inputToken: {
            symbol: pair.inputToken.symbol,
            address: pair.inputToken.address,
          },
          outputToken: {
            symbol: pair.outputToken.symbol,
            address: pair.outputToken.address,
          },
          amount: inputAmount,
          poolAddress: pair.poolAddress,
        });

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

        // Debug: Log pool data
        console.log("Pool Data:", {
          token0,
          token1,
          sqrtPriceX96: slot0.sqrtPriceX96.toString(),
          liquidity: liquidity.toString(),
          tick: slot0.tick,
        });

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

        // Create SDK tokens with proper WETH substitution
        const inputToken = toSDKToken(
          {
            ...pair.inputToken,
            address:
              pair.inputToken.symbol === "ETH"
                ? WETH_ADDRESS
                : pair.inputToken.address,
          },
          chain.id
        );

        const outputToken = toSDKToken(
          {
            ...pair.outputToken,
            address:
              pair.outputToken.symbol === "ETH"
                ? WETH_ADDRESS
                : pair.outputToken.address,
          },
          chain.id
        );

        // Debug: Log token addresses after WETH substitution
        console.log("Token Addresses:", {
          inputToken: inputToken.address,
          outputToken: outputToken.address,
          poolToken0: token0,
          poolToken1: token1,
        });

        // Create Pool instance with correct token ordering based on pool's token0/token1
        const pool = new Pool(
          toSDKToken(
            {
              ...pair.inputToken,
              address:
                token0.toLowerCase() === pair.inputToken.address.toLowerCase()
                  ? pair.inputToken.address
                  : pair.outputToken.address,
            },
            chain.id
          ),
          toSDKToken(
            {
              ...pair.outputToken,
              address:
                token1.toLowerCase() === pair.outputToken.address.toLowerCase()
                  ? pair.outputToken.address
                  : pair.inputToken.address,
            },
            chain.id
          ),
          pair.fee,
          slot0.sqrtPriceX96.toString(),
          liquidity.toString(),
          slot0.tick
        );

        // Parse input amount with proper decimals
        const parsedAmount = ethers.utils.parseUnits(
          inputAmount,
          pair.inputToken.decimals
        );

        const amountIn = CurrencyAmount.fromRawAmount(
          inputToken,
          parsedAmount.toString()
        );

        // Create trade with proper route
        const route = new Route([pool], inputToken, outputToken);
        const trade = await Trade.createUncheckedTrade({
          route,
          inputAmount: amountIn,
          outputAmount: CurrencyAmount.fromRawAmount(outputToken, "0"),
          tradeType: TradeType.EXACT_INPUT,
        });

        // Prepare swap parameters with proper value handling
        const options = {
          slippageTolerance,
          deadline: Math.floor(Date.now() / 1000) + 1800,
          recipient: address,
        };

        // Add value for ETH swaps
        const swapOptions = {
          ...options,
          ...(pair.inputToken.symbol === "ETH"
            ? { value: parsedAmount.toString() }
            : {}),
        };

        const { calldata, value } = SwapRouter.swapCallParameters(
          [trade],
          swapOptions
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

        // Debug the transaction parameters
        console.log("Transaction Parameters:", {
          from: address,
          to: formattedAddress,
          value:
            pair.inputToken.symbol === "ETH" ? parsedAmount.toString() : "0",
          calldata: formattedData,
        });

        // Send transaction with proper value
        const hash = await walletClient.sendTransaction({
          account: address,
          to: formattedAddress,
          data: formattedData,
          value:
            pair.inputToken.symbol === "ETH"
              ? BigInt(parsedAmount.toString())
              : BigInt(0),
          gas: gasWithBuffer,
        });

        return hash;
      } catch (error: any) {
        console.error("Swap execution error:", {
          error,
          errorMessage: error.message,
          errorReason: error.reason,
          errorCode: error.code,
          errorData: error.data,
          poolAddress: pair.poolAddress,
          inputToken: pair.inputToken.address,
          outputToken: pair.outputToken.address,
        });
        throw error;
      }
    },
    [address, chain?.id, publicClient, walletClient]
  );

  return { executeSwap };
}
