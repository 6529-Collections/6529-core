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

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const executeSwap = useCallback(
    async (
      pair: TokenPair,
      inputAmount: string,
      slippageTolerance: Percent = new Percent(50, 10_000)
    ) => {
      if (!address || !chain?.id || !walletClient || !publicClient) {
        throw new Error("Missing required connection details");
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

        // Check ETH balance before proceeding
        if (isInputETH) {
          const balance = await publicClient.getBalance({ address });
          const requiredAmount = parsedAmount;
          const wethAddress = WETH9[chain.id as keyof typeof WETH9];
          const depositCalldata = WETH_INTERFACE.encodeFunctionData("deposit");

          // Get max gas price
          const maxGasPrice = await getMaxGasPrice(publicClient);

          // Estimate gas with explicit gas price
          const estimatedGas = await publicClient.estimateGas({
            account: address,
            to: wethAddress as `0x${string}`,
            data: depositCalldata as `0x${string}`,
            value: BigInt(parsedAmount.toString()),
            gasPrice: maxGasPrice,
          });

          const gasCost = estimatedGas * maxGasPrice;
          const totalRequired = BigInt(requiredAmount.toString()) + gasCost;

          console.log("\n=== Detailed Balance Check ===");
          console.log(
            "Current Balance (ETH):",
            ethers.utils.formatEther(balance)
          );
          console.log(
            "Required Amount (ETH):",
            ethers.utils.formatEther(requiredAmount.toString())
          );
          console.log(
            "Max Gas Price (Gwei):",
            ethers.utils.formatUnits(maxGasPrice, "gwei")
          );
          console.log("Estimated Gas:", estimatedGas.toString());
          console.log("Gas Cost (ETH):", ethers.utils.formatEther(gasCost));
          console.log(
            "Total Required (ETH):",
            ethers.utils.formatEther(totalRequired)
          );

          if (balance < totalRequired) {
            throw new Error(
              `Insufficient ETH balance. You need at least ${ethers.utils.formatEther(
                totalRequired
              )} ETH (including gas costs) but have ${ethers.utils.formatEther(
                balance
              )} ETH`
            );
          }

          try {
            // Send deposit transaction with explicit gas parameters
            const wrapTxHash = await walletClient.sendTransaction({
              to: wethAddress as `0x${string}`,
              data: depositCalldata as `0x${string}`,
              value: BigInt(parsedAmount.toString()),
              gas: calculateGasWithBuffer(estimatedGas, 20),
              gasPrice: maxGasPrice,
              chainId: chain.id,
            });

            console.log("Wrap Transaction Hash:", wrapTxHash);

            // Wait for transaction
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: wrapTxHash,
            });
            console.log("Wrap Transaction Receipt:", receipt);

            // Create approve calldata
            const approveCalldata = WETH_INTERFACE.encodeFunctionData(
              "approve",
              [
                CHAIN_ROUTER_ADDRESSES[chain.id as SupportedChainId],
                parsedAmount.toString(),
              ]
            );

            // Send approve transaction
            const approveTxHash = await walletClient.sendTransaction({
              to: wethAddress as `0x${string}`,
              data: approveCalldata as `0x${string}`,
            });

            // Wait for transaction
            await publicClient.waitForTransactionReceipt({
              hash: approveTxHash,
            });
          } catch (wrapError) {
            console.error("ETH Wrapping failed:", wrapError);
            // Add more detailed error information
            console.error("Error details:", {
              balance: ethers.utils.formatEther(balance),
              required: ethers.utils.formatEther(totalRequired),
              gasPrice: ethers.utils.formatUnits(maxGasPrice, "gwei"),
              estimatedGas: estimatedGas.toString(),
              error: wrapError,
            });
            throw wrapError;
          }
        }

        // Use WETH address instead of ETH for the actual swap
        const adjustedInputToken = {
          ...pair.inputToken,
          address: isInputETH
            ? WETH9[chain.id as keyof typeof WETH9]
            : pair.inputToken.address,
        };

        const adjustedOutputToken = {
          ...pair.outputToken,
          address: isOutputETH
            ? WETH9[chain.id as keyof typeof WETH9]
            : pair.outputToken.address,
        };

        // Rest of your existing swap code, but use adjustedInputToken and adjustedOutputToken
        const poolContract = new ethers.Contract(
          pair.poolAddress,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        // Get pool state
        const [slot0, liquidity] = await Promise.all([
          poolContract.slot0(),
          poolContract.liquidity(),
        ]);

        if (liquidity.isZero()) {
          throw new Error("Pool has no liquidity");
        }

        // Create pool instance with tick data provider
        const tickSpacing = pair.fee / 50; // Uniswap V3 tick spacing formula
        const pool = new Pool(
          toSDKToken(adjustedInputToken, chain.id),
          toSDKToken(adjustedOutputToken, chain.id),
          pair.fee,
          slot0.sqrtPriceX96.toString(),
          liquidity.toString(),
          slot0.tick,
          createTickDataProvider(poolContract, tickSpacing)
        );

        // Create route and trade with adjusted tokens
        const route = new Route(
          [pool],
          toSDKToken(adjustedInputToken, chain.id),
          toSDKToken(adjustedOutputToken, chain.id)
        );
        const trade = await Trade.exactIn(
          route,
          CurrencyAmount.fromRawAmount(
            toSDKToken(adjustedInputToken, chain.id),
            parsedAmount.toString()
          )
        );

        // Validate trade
        if (trade.priceImpact.greaterThan(new Percent(15, 100))) {
          throw new Error(
            `Price impact too high: ${trade.priceImpact.toFixed(2)}%`
          );
        }

        // Get swap parameters
        const swapParams = SwapRouter.swapCallParameters([trade], {
          slippageTolerance,
          recipient: address,
          deadline: Math.floor(Date.now() / 1000) + 3600,
        });

        console.log("\n=== Swap Parameters ===");
        console.log("Calldata:", swapParams.calldata);
        console.log("Value:", swapParams.value);

        // Format transaction data
        const routerAddress = ensureChecksum(
          CHAIN_ROUTER_ADDRESSES[chain.id as SupportedChainId]
        ) as `0x${string}`;

        // Add debug logging
        await debugSwapParams(pool, trade, provider, pair.poolAddress);

        // Move txValue declaration outside the try block
        const txValue = "0";

        try {
          const gasEstimate = await publicClient.estimateGas({
            account: address,
            to: routerAddress,
            data: swapParams.calldata as `0x${string}`,
            value: BigInt(txValue),
          });

          const hash = await walletClient.sendTransaction({
            to: routerAddress,
            data: swapParams.calldata as `0x${string}`,
            value: BigInt(txValue),
            gas: calculateGasWithBuffer(gasEstimate, 30),
          });

          return hash;
        } catch (txError) {
          await decodeRouterError(
            txError,
            provider,
            routerAddress,
            swapParams.calldata,
            BigInt(txValue)
          );
          throw txError;
        }
      } catch (error) {
        console.error("Swap failed:", error);
        throw error;
      }
    },
    [address, chain?.id, publicClient, walletClient]
  );

  return { executeSwap };
}
