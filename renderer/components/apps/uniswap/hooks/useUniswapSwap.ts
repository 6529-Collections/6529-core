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

function calculateGasWithBuffer(gas: bigint, bufferPercent: number): bigint {
  return (gas * BigInt(100 + bufferPercent)) / BigInt(100);
}

// Update WETH9 constant to ensure addresses are checksummed
const WETH9 = {
  [1]: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  [11155111]: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // Sepolia WETH
} as const;

// Add this helper to decode router errors
const decodeRouterError = async (
  error: any,
  provider: ethers.providers.Web3Provider,
  routerAddress: string,
  calldata: string,
  value: bigint
) => {
  console.log("\n=== Router Error Debug ===");
  console.log("Router Address:", routerAddress);
  console.log("Calldata:", calldata);
  console.log("Value:", value.toString());

  try {
    // Try to simulate the transaction to get more details
    await provider.call({
      to: routerAddress,
      data: calldata,
      value: value.toString(),
    });
  } catch (simulationError: any) {
    console.log("\nTransaction Simulation Error:");
    console.log("Error Data:", simulationError.data);

    // Try to decode the revert reason
    if (simulationError.data) {
      try {
        const decodedError = ethers.utils.toUtf8String(
          "0x" + simulationError.data.slice(138)
        );
        console.log("Decoded Error:", decodedError);
      } catch (e) {
        console.log("Could not decode error data");
      }
    }
  }
};

// Enhance the debug swap params function
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

  console.log("\n=== Swap Debug Info ===");
  console.log("Pool Address:", poolAddress);
  console.log("Pool Fee:", pool.fee);
  console.log("Pool Liquidity:", pool.liquidity.toString());
  console.log("Pool Tick:", pool.tickCurrent);
  console.log("Pool SqrtPrice:", pool.sqrtRatioX96.toString());

  // Get current pool state
  const [slot0, liquidity, token0, token1] = await Promise.all([
    poolContract.slot0(),
    poolContract.liquidity(),
    poolContract.token0(),
    poolContract.token1(),
  ]);

  console.log("\nPool Token Info:");
  console.log("Token0:", token0);
  console.log("Token1:", token1);

  console.log("\nCurrent Pool State:");
  console.log("- Current Liquidity:", liquidity.toString());
  console.log("- Current Tick:", slot0.tick);
  console.log("- Current SqrtPrice:", slot0.sqrtPriceX96.toString());

  console.log("\nTrade Info:");
  console.log("Input Token:", trade.inputAmount.currency.address);
  console.log("Output Token:", trade.outputAmount.currency.address);
  console.log("Input Amount:", trade.inputAmount.toSignificant(6));
  console.log("Output Amount:", trade.outputAmount.toSignificant(6));
  console.log("Execution Price:", trade.executionPrice.toSignificant(6));
  console.log("Price Impact:", trade.priceImpact.toSignificant(2), "%");

  // Add route info
  console.log("\nRoute Info:");
  trade.route.pools.forEach((pool, index) => {
    console.log(`Pool ${index + 1}:`);
    console.log("- Token0:", pool.token0.address);
    console.log("- Token1:", pool.token1.address);
    console.log("- Fee:", pool.fee);
  });
};

// Add this helper to convert values to bigint
const toBigInt = (value: string | ethers.BigNumber | number): bigint => {
  if (typeof value === "string") {
    return BigInt(value);
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  return BigInt(value.toString());
};

// Add this helper function to create a tick data provider
const createTickDataProvider = (
  poolContract: ethers.Contract,
  tickSpacing: number
) => {
  return {
    async getTick(tick: number) {
      try {
        const { liquidityNet } = await poolContract.ticks(tick);
        return {
          liquidityNet: liquidityNet.toString(),
          liquidityGross: "0", // Not needed for basic swaps
        };
      } catch (error) {
        console.warn(`Failed to get tick ${tick}:`, error);
        return {
          liquidityNet: "0",
          liquidityGross: "0",
        };
      }
    },

    async nextInitializedTickWithinOneWord(
      tick: number,
      lte: boolean,
      tickSpacing: number
    ): Promise<[number, boolean]> {
      try {
        // Align tick on spacing
        const compressed = Math.floor(tick / tickSpacing);
        const next = lte
          ? compressed * tickSpacing
          : (compressed + 1) * tickSpacing;

        // Check if this tick is initialized
        const { liquidityNet } = await poolContract.ticks(next);
        const initialized = !liquidityNet.isZero();

        return [next, initialized];
      } catch (error) {
        console.warn(`Failed to get next tick for ${tick}:`, error);
        return [tick + (lte ? -tickSpacing : tickSpacing), false];
      }
    },
  };
};

// Update WETH ABI to include interface
const WETH_INTERFACE = new ethers.utils.Interface([
  "function deposit() payable",
  "function withdraw(uint256) public",
  "function approve(address, uint256) public returns (bool)",
]);

// Add this helper function at the top
const getMaxGasPrice = async (publicClient: any) => {
  const feeData = await publicClient.getFeeHistory({
    blockCount: 4,
    rewardPercentiles: [75],
  });

  // Use the max gas price from recent blocks with a buffer
  const maxGasPrice = Math.max(
    ...feeData.baseFeePerGas.map((fee: any) => Number(fee))
  );
  return BigInt(Math.floor(maxGasPrice * 1.5)); // 50% buffer
};

interface SwapResult {
  status: "pending" | "success" | "error";
  hash?: `0x${string}`;
  error?: string;
}

// Add these helper functions before the useUniswapSwap hook

async function getPoolInstance(
  pair: TokenPair,
  provider: ethers.providers.Provider,
  chainId: number
): Promise<Pool | null> {
  try {
    const poolContract = new ethers.Contract(
      pair.poolAddress,
      UNISWAP_V3_POOL_ABI,
      provider
    );

    const [slot0, liquidity] = await Promise.all([
      poolContract.slot0(),
      poolContract.liquidity(),
    ]);

    const token0 = toSDKToken(pair.inputToken, chainId);
    const token1 = toSDKToken(pair.outputToken, chainId);

    return new Pool(
      token0,
      token1,
      pair.fee,
      slot0.sqrtPriceX96.toString(),
      liquidity.toString(),
      slot0.tick
    );
  } catch (error) {
    console.error("Failed to get pool instance:", error);
    return null;
  }
}

async function createAndValidateTrade(
  pool: Pool,
  pair: TokenPair,
  parsedAmount: ethers.BigNumber,
  chainId: number,
  isInputETH: boolean,
  isOutputETH: boolean
): Promise<{
  success: boolean;
  data?: Trade<SDKToken, SDKToken, TradeType>;
  error?: string;
}> {
  try {
    const inputToken = toSDKToken(pair.inputToken, chainId);
    const outputToken = toSDKToken(pair.outputToken, chainId);

    const inputAmount = CurrencyAmount.fromRawAmount(
      inputToken,
      parsedAmount.toString()
    );

    const route = new Route([pool], inputToken, outputToken);

    // Calculate the output amount using the route
    const outputAmount = await pool.getOutputAmount(inputAmount);

    // Create the trade with both input and output amounts
    const trade = Trade.createUncheckedTrade({
      route,
      inputAmount,
      outputAmount: outputAmount[0],
      tradeType: TradeType.EXACT_INPUT,
    });

    return { success: true, data: trade };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

async function calculateGasLimit(
  routerAddress: string,
  swapParams: { calldata: string; value: string },
  publicClient: any,
  address: string
): Promise<bigint> {
  const gasEstimate = await publicClient.estimateGas({
    account: address,
    to: routerAddress,
    data: swapParams.calldata as `0x${string}`,
    value: BigInt(swapParams.value),
  });

  return calculateGasWithBuffer(gasEstimate, 20); // Add 20% buffer
}

async function approveToken(
  tokenAddress: string,
  amount: ethers.BigNumber,
  chainId: number,
  walletClient: any,
  address: string
): Promise<`0x${string}`> {
  const routerAddress = CHAIN_ROUTER_ADDRESSES[chainId as SupportedChainId];

  const approveData = new ethers.utils.Interface([
    "function approve(address spender, uint256 amount) public returns (bool)",
  ]).encodeFunctionData("approve", [routerAddress, amount.toString()]);

  return await walletClient.sendTransaction({
    to: tokenAddress as `0x${string}`,
    data: approveData as `0x${string}`,
    account: address,
  });
}

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const executeSwap = useCallback(
    async (
      pair: TokenPair,
      inputAmount: string,
      slippageTolerance: Percent = new Percent(50, 10_000) // 0.5% default slippage
    ): Promise<SwapResult> => {
      if (!address || !chain?.id || !walletClient || !publicClient) {
        return {
          status: "error",
          error: "Missing required connection details",
        };
      }

      const provider = new ethers.providers.Web3Provider(
        publicClient.transport
      );

      try {
        const parsedAmount = ethers.utils.parseUnits(
          inputAmount,
          pair.inputToken.decimals
        );

        const isInputETH = pair.inputToken.symbol === "ETH";
        const isOutputETH = pair.outputToken.symbol === "ETH";

        // Handle ETH wrapping if needed
        if (isInputETH) {
          const wrapResult = await handleETHWrapping(
            parsedAmount,
            chain.id,
            address,
            publicClient,
            walletClient
          );

          if (!wrapResult.success) {
            return {
              status: "error",
              error: wrapResult.error,
            };
          }
        }

        // Get pool instance
        const pool = await getPoolInstance(pair, provider, chain.id);
        if (!pool) {
          return {
            status: "error",
            error: "Failed to get pool instance",
          };
        }

        // Create and validate trade
        const trade = await createAndValidateTrade(
          pool,
          pair,
          parsedAmount,
          chain.id,
          isInputETH,
          isOutputETH
        );

        if (!trade.success || !trade.data) {
          return {
            status: "error",
            error: trade.error || "Failed to create trade",
          };
        }

        // Get swap parameters
        const swapParams = SwapRouter.swapCallParameters(trade.data, {
          slippageTolerance,
          recipient: address,
          deadline: Math.floor(Date.now() / 1000) + 1800, // 30 min deadline
        });

        // Execute the swap
        const routerAddress = ensureChecksum(
          CHAIN_ROUTER_ADDRESSES[chain.id as SupportedChainId]
        ) as `0x${string}`;

        const hash = await walletClient.sendTransaction({
          to: routerAddress,
          data: swapParams.calldata as `0x${string}`,
          value: BigInt(swapParams.value),
          gas: await calculateGasLimit(
            routerAddress,
            swapParams,
            publicClient,
            address
          ),
        });

        return {
          status: "pending",
          hash,
        };
      } catch (error: any) {
        console.error("Swap execution error:", error);
        return {
          status: "error",
          error: error.message || "Failed to execute swap",
        };
      }
    },
    [address, chain?.id, publicClient, walletClient]
  );

  return { executeSwap };
}

// Helper functions
async function handleETHWrapping(
  amount: ethers.BigNumber,
  chainId: number,
  address: string,
  publicClient: any,
  walletClient: any
) {
  try {
    const wethAddress = WETH9[chainId as keyof typeof WETH9];
    const depositCalldata = WETH_INTERFACE.encodeFunctionData("deposit");

    // Estimate gas with buffer
    const gasEstimate = await publicClient.estimateGas({
      account: address,
      to: wethAddress as `0x${string}`,
      data: depositCalldata as `0x${string}`,
      value: BigInt(amount.toString()),
    });

    const wrapTxHash = await walletClient.sendTransaction({
      to: wethAddress as `0x${string}`,
      data: depositCalldata as `0x${string}`,
      value: BigInt(amount.toString()),
      gas: calculateGasWithBuffer(gasEstimate, 20),
    });

    await publicClient.waitForTransactionReceipt({ hash: wrapTxHash });

    // Approve WETH spending
    const approveHash = await approveToken(
      wethAddress,
      amount,
      chainId,
      walletClient,
      address
    );

    await publicClient.waitForTransactionReceipt({ hash: approveHash });

    return { success: true };
  } catch (error: any) {
    return {
      success: false,
      error: `ETH wrapping failed: ${error.message}`,
    };
  }
}

// ... Add other helper functions ...
