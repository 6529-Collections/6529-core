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
import { Token, TokenPair, toSDKToken } from "../types";
import { UNISWAP_V3_POOL_ABI, ERC20_ABI } from "../abis";
import {
  CHAIN_ROUTER_ADDRESSES,
  WETH_ADDRESS,
  ensureChecksum,
  type SupportedChainId,
} from "../constants";

import { TICK_LENS_ADDRESS } from "../constants";

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

// Helper function to determine if token is ETH/WETH
const isETH = (token: Token) =>
  token.symbol === "ETH" || token.symbol === "WETH";

// Add this helper function to convert BigNumber to bigint
const bigNumberToBigInt = (bn: ethers.BigNumber): bigint => {
  return BigInt(bn.toString());
};

// Update WETH9 constant to ensure addresses are checksummed
const WETH9 = {
  [1]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  [11155111]: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
} as const;

// Update the getChecksummedAddress function to be more robust
const getChecksummedAddress = (address: string): string => {
  try {
    // First normalize the address to lowercase
    const normalizedAddress = address.toLowerCase();
    // Then get the proper checksum format
    return ethers.utils.getAddress(normalizedAddress);
  } catch (error) {
    console.error("Invalid address format:", address);
    throw new Error(`Invalid address format: ${address}`);
  }
};

// Update the debug function to use the correct Pool properties
const debugSwapParams = async (
  pool: Pool,
  trade: Trade<SDKToken, SDKToken, TradeType>,
  provider: ethers.providers.Web3Provider,
  poolAddress: string
) => {
  const poolContract = new ethers.Contract(
    poolAddress,
    UNISWAP_V3_POOL_ABI,
    provider
  );

  console.log("=== Swap Debug Info ===");
  console.log("Pool Address:", poolAddress);
  console.log("Pool Fee:", pool.fee);
  console.log("Pool Liquidity:", pool.liquidity.toString());
  console.log("Pool Tick:", pool.tickCurrent);
  console.log("Pool SqrtPrice:", pool.sqrtRatioX96.toString());

  // Get current pool state
  const [slot0, liquidity] = await Promise.all([
    poolContract.slot0(),
    poolContract.liquidity(),
  ]);

  console.log("Current Pool State:");
  console.log("- Current Liquidity:", liquidity.toString());
  console.log("- Current Tick:", slot0.tick);
  console.log("- Current SqrtPrice:", slot0.sqrtPriceX96.toString());

  console.log("\nTrade Info:");
  console.log("Input Amount:", trade.inputAmount.toSignificant(6));
  console.log("Output Amount:", trade.outputAmount.toSignificant(6));
  console.log("Execution Price:", trade.executionPrice.toSignificant(6));
  console.log("Price Impact:", trade.priceImpact.toSignificant(2), "%");
};

// Add this helper function to simulate the transaction
const simulateTransaction = async (
  provider: ethers.providers.Web3Provider,
  txParams: {
    from: string;
    to: string;
    data: string;
    value: string | bigint;
  }
) => {
  try {
    // First try using eth_call to simulate
    const result = await provider.call({
      from: txParams.from,
      to: txParams.to,
      data: txParams.data,
      value: txParams.value.toString(),
    });

    console.log("Transaction simulation successful:", result);
    return true;
  } catch (error: any) {
    // Parse the revert reason if possible
    console.error("Transaction simulation failed:", {
      error,
      data: error.data,
      message: error.message,
    });

    // Try to decode the revert reason
    if (error.data) {
      try {
        const reason = ethers.utils.toUtf8String(error.data);
        console.log("Decoded revert reason:", reason);
      } catch (e) {
        console.log("Could not decode revert reason from:", error.data);
      }
    }

    return false;
  }
};

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Helper function to get pool data
  const getPoolData = async (
    poolContract: ethers.Contract,
    inputToken: Token,
    outputToken: Token
  ) => {
    const [slot0, liquidity, token0, token1] = await Promise.all([
      retryPromise(() => poolContract.slot0()) as Promise<PoolState["slot0"]>,
      retryPromise(() => poolContract.liquidity()) as Promise<ethers.BigNumber>,
      retryPromise(() => poolContract.token0()) as Promise<string>,
      retryPromise(() => poolContract.token1()) as Promise<string>,
    ]);

    if (!slot0 || !liquidity || !token0 || !token1) {
      throw new Error("Failed to fetch pool data");
    }

    if (liquidity.isZero()) {
      throw new Error("Pool has no liquidity");
    }

    // Validate tokens are in correct order
    const [token0Address, token1Address] = [token0, token1].map((addr) =>
      getChecksummedAddress(addr)
    );
    const inputTokenAddress = getChecksummedAddress(inputToken.address);
    const outputTokenAddress = getChecksummedAddress(outputToken.address);

    if (
      ![token0Address, token1Address].includes(inputTokenAddress) ||
      ![token0Address, token1Address].includes(outputTokenAddress)
    ) {
      throw new Error("Token addresses don't match pool tokens");
    }

    return { slot0, liquidity, token0, token1 };
  };

  // Helper function to create pool instance
  const createPool = async (
    token0: string,
    token1: string,
    fee: number,
    sqrtPriceX96: string,
    liquidity: string,
    tick: number,
    chainId: number,
    inputToken: Token,
    outputToken: Token,
    poolAddress: string
  ) => {
    if (!publicClient?.transport) {
      throw new Error("No transport available");
    }

    const provider = new ethers.providers.Web3Provider(publicClient.transport);

    // Create tick data provider
    const tickLensContract = new ethers.Contract(
      TICK_LENS_ADDRESS[chainId as SupportedChainId],
      [
        "function getPopulatedTicksInWord(address pool, int16 tickBitmapIndex) external view returns (tuple(int24 tick, int128 liquidityNet, uint128 liquidityGross)[] populatedTicks)",
      ],
      provider
    );

    // Create tick data provider object
    const tickDataProvider = {
      async getTick(tick: number) {
        const tickSpacing = fee / 50;
        const minTick = Math.floor(tick / tickSpacing) * tickSpacing;
        const wordPos = Math.floor(minTick / 256);

        try {
          const populatedTicks = await tickLensContract.getPopulatedTicksInWord(
            poolAddress,
            wordPos
          );

          const foundTick = populatedTicks.find(
            (t: { tick: number }) => t.tick === tick
          );
          if (foundTick) {
            return {
              liquidityNet: foundTick.liquidityNet.toString(),
            };
          }

          return {
            liquidityNet: "0",
          };
        } catch (error) {
          console.error("Error fetching tick data:", error);
          return {
            liquidityNet: "0",
          };
        }
      },

      async nextInitializedTickWithinOneWord(
        tick: number,
        lte: boolean,
        tickSpacing: number
      ): Promise<[number, boolean]> {
        const wordPos = Math.floor(tick / 256);

        try {
          const populatedTicks = await tickLensContract.getPopulatedTicksInWord(
            poolAddress,
            wordPos
          );

          // Sort ticks based on direction
          const sortedTicks = [...populatedTicks]
            .map((t) => t.tick)
            .sort((a, b) => (lte ? b - a : a - b));

          // Find the next initialized tick
          const nextTick = lte
            ? sortedTicks.find((t) => t <= tick)
            : sortedTicks.find((t) => t >= tick);

          // Return tuple instead of object
          return [
            nextTick ?? (lte ? tick - tickSpacing : tick + tickSpacing),
            nextTick !== undefined,
          ];
        } catch (error) {
          console.error("Error fetching next tick:", error);
          // Return tuple instead of object
          return [lte ? tick - tickSpacing : tick + tickSpacing, false];
        }
      },
    };

    // Ensure addresses are checksummed
    const checksummedToken0 = getChecksummedAddress(token0);
    const checksummedToken1 = getChecksummedAddress(token1);
    const checksummedInputAddress = getChecksummedAddress(inputToken.address);
    const checksummedOutputAddress = getChecksummedAddress(outputToken.address);

    return new Pool(
      toSDKToken(
        {
          ...inputToken,
          address:
            checksummedToken0.toLowerCase() ===
            checksummedInputAddress.toLowerCase()
              ? checksummedToken0
              : checksummedToken1,
        },
        chainId
      ),
      toSDKToken(
        {
          ...outputToken,
          address:
            checksummedToken1.toLowerCase() ===
            checksummedOutputAddress.toLowerCase()
              ? checksummedToken1
              : checksummedToken0,
        },
        chainId
      ),
      fee,
      sqrtPriceX96,
      liquidity,
      tick,
      tickDataProvider
    );
  };

  // Token approval function
  const getTokenApproval = async (
    token: Token,
    amount: ethers.BigNumber
  ): Promise<boolean> => {
    if (!address || !chain?.id || !walletClient || !publicClient) return false;
    if (token.symbol === "ETH") return true;

    try {
      // Add null check for publicClient
      if (!publicClient?.transport) {
        throw new Error("No transport available");
      }

      const provider = new ethers.providers.Web3Provider(
        publicClient.transport
      );
      const tokenContract = new ethers.Contract(
        token.address,
        ERC20_ABI,
        provider
      );
      const routerAddress = ensureChecksum(
        CHAIN_ROUTER_ADDRESSES[chain.id as SupportedChainId]
      );

      const currentAllowance = await tokenContract.allowance(
        address,
        routerAddress
      );

      if (currentAllowance.lt(amount)) {
        const tx = await tokenContract
          .connect(provider.getSigner())
          .approve(routerAddress, ethers.constants.MaxUint256);
        await tx.wait();
      }

      return true;
    } catch (error) {
      console.error("Approval error:", error);
      return false;
    }
  };

  // Retry promise helper
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

  // Main swap execution function
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
        // Parse amount and check if dealing with ETH
        const parsedAmount = ethers.utils.parseUnits(
          inputAmount,
          pair.inputToken.decimals
        );
        const isInputETH = isETH(pair.inputToken);
        const isOutputETH = isETH(pair.outputToken);

        // Get approval if needed
        if (!isInputETH) {
          const approved = await getTokenApproval(
            pair.inputToken,
            parsedAmount
          );
          if (!approved) {
            throw new Error("Token approval failed");
          }
        }

        // Add null check for publicClient
        if (!publicClient?.transport) {
          throw new Error("No transport available");
        }

        const provider = new ethers.providers.Web3Provider(
          publicClient.transport
        );

        // Create provider and get pool data
        const poolContract = new ethers.Contract(
          pair.poolAddress,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        // Adjust input/output tokens for WETH wrapping with checksummed addresses
        const wethAddress =
          isInputETH || isOutputETH
            ? getChecksummedAddress(WETH9[chain.id as keyof typeof WETH9])
            : undefined;

        const adjustedInputToken = {
          ...pair.inputToken,
          address: isInputETH
            ? wethAddress!
            : getChecksummedAddress(pair.inputToken.address),
        };

        const adjustedOutputToken = {
          ...pair.outputToken,
          address: isOutputETH
            ? wethAddress!
            : getChecksummedAddress(pair.outputToken.address),
        };

        const { slot0, liquidity, token0, token1 } = await getPoolData(
          poolContract,
          adjustedInputToken,
          adjustedOutputToken
        );

        // Create pool instance and await it
        const pool = await createPool(
          token0,
          token1,
          pair.fee,
          slot0.sqrtPriceX96.toString(),
          liquidity.toString(),
          slot0.tick,
          chain.id,
          adjustedInputToken,
          adjustedOutputToken,
          pair.poolAddress
        );

        // Create trade with the resolved pool
        const route = new Route(
          [pool],
          toSDKToken(adjustedInputToken, chain.id),
          toSDKToken(adjustedOutputToken, chain.id)
        );

        // Use Trade.exactIn instead of createUncheckedTrade
        const trade = await Trade.exactIn(
          route,
          CurrencyAmount.fromRawAmount(
            toSDKToken(adjustedInputToken, chain.id),
            parsedAmount.toString()
          )
        );

        // Add validation before proceeding
        if (trade.outputAmount.equalTo(0)) {
          throw new Error("Invalid trade: output amount is zero");
        }

        if (trade.priceImpact.greaterThan(new Percent(15, 100))) {
          throw new Error(
            `Price impact too high: ${trade.priceImpact.toFixed(2)}%`
          );
        }

        // Format transaction data with proper types first
        const routerAddress = ensureChecksum(
          CHAIN_ROUTER_ADDRESSES[chain.id as SupportedChainId]
        ) as `0x${string}`;

        // Get swap parameters
        const { calldata, value } = SwapRouter.swapCallParameters([trade], {
          slippageTolerance,
          recipient: address,
          deadline: Math.floor(Date.now() / 1000) + 3600,
        });

        const formattedData = calldata.toLowerCase().startsWith("0x")
          ? (calldata as `0x${string}`)
          : (`0x${calldata}` as `0x${string}`);

        // Convert parsedAmount to bigint
        const parsedAmountBigInt = bigNumberToBigInt(parsedAmount);

        // Add debug logging
        await debugSwapParams(pool, trade, provider, pair.poolAddress);

        // Add more debug info for the actual swap call
        console.log("\nSwap Call Parameters:");
        console.log(
          "Router Address:",
          CHAIN_ROUTER_ADDRESSES[chain.id as SupportedChainId]
        );
        console.log("Calldata:", calldata);
        console.log("Value:", value);
        console.log("Gas Estimate Params:", {
          from: address,
          to: routerAddress,
          data: formattedData,
          value: isInputETH ? parsedAmountBigInt : BigInt(value),
        });

        // Add debug logging
        console.debug("Swap Parameters:", {
          poolAddress: pair.poolAddress,
          inputToken: adjustedInputToken.address,
          outputToken: adjustedOutputToken.address,
          amount: parsedAmount.toString(),
          routerAddress,
          calldata: formattedData,
          value: isInputETH ? parsedAmount : BigInt(value),
        });

        // Estimate gas with proper types and increased gas limit
        await simulateTransaction(provider, {
          from: address,
          to: routerAddress,
          data: formattedData,
          value: isInputETH ? parsedAmountBigInt : BigInt(value),
        });

        const gasEstimate = await retryPromise(() =>
          publicClient.estimateGas({
            account: address,
            to: routerAddress,
            data: formattedData,
            value: isInputETH ? parsedAmountBigInt : BigInt(value),
          })
        );

        const gasWithBuffer = calculateGasWithBuffer(gasEstimate, 30); // Increased buffer to 30%

        // Send transaction with proper types
        const hash = await walletClient.sendTransaction({
          to: routerAddress,
          data: formattedData,
          value: isInputETH ? parsedAmountBigInt : BigInt(value),
          gas: gasWithBuffer,
        });

        return hash;
      } catch (error: any) {
        // Enhance error logging
        console.error("Detailed Swap Error:", {
          error,
          errorMessage: error.message,
          errorReason: error.reason,
          errorCode: error.code,
          errorData: error.data,
          cause: error.cause,
          poolAddress: pair.poolAddress,
          inputToken: {
            address: pair.inputToken.address,
            symbol: pair.inputToken.symbol,
            decimals: pair.inputToken.decimals,
          },
          outputToken: {
            address: pair.outputToken.address,
            symbol: pair.outputToken.symbol,
            decimals: pair.outputToken.decimals,
          },
          amount: inputAmount,
          chainId: chain?.id,
        });
        throw error;
      }
    },
    [address, chain?.id, publicClient, walletClient]
  );

  return { executeSwap };
}
