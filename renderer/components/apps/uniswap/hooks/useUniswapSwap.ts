import { useCallback } from "react";
import { ethers } from "ethersv5";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import {
  CurrencyAmount,
  Percent,
  Token as SDKToken,
  TradeType,
} from "@uniswap/sdk-core";
import { SwapRouter, Pool, Trade, Route, SwapQuoter } from "@uniswap/v3-sdk";
import { TokenPair, Token } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import {
  QUOTER_CONTRACT_ADDRESS,
  SWAP_ROUTER_ADDRESS,
  SupportedChainId,
} from "../constants";
import { toSDKToken } from "../types";

interface SwapResult {
  status: "pending" | "error";
  hash?: `0x${string}`;
  error?: string;
}

async function getPoolInfo(poolContract: ethers.Contract) {
  const [slot0, liquidity, token0, token1] = await Promise.all([
    poolContract.slot0(),
    poolContract.liquidity(),
    poolContract.token0(),
    poolContract.token1(),
  ]);

  return {
    liquidity: liquidity.toString(),
    sqrtPriceX96: slot0.sqrtPriceX96.toString(),
    tick: slot0.tick,
    token0,
    token1,
  };
}

async function getTokenTransferApproval(
  token: Token,
  amount: string,
  spender: string,
  provider: ethers.providers.Web3Provider
) {
  if (token.symbol === "ETH") return true;

  const tokenContract = new ethers.Contract(
    token.address,
    ["function approve(address spender, uint256 amount) returns (bool)"],
    provider.getSigner()
  );

  try {
    const transaction = await tokenContract.approve(
      spender,
      ethers.constants.MaxUint256
    );
    await transaction.wait();
    return true;
  } catch (e) {
    console.error("Error getting token transfer approval:", e);
    return false;
  }
}

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const executeSwap = useCallback(
    async (
      pair: TokenPair,
      inputAmount: string,
      slippageTolerance: Percent = new Percent(50, 10_000)
    ): Promise<SwapResult> => {
      if (!address || !chain?.id || !walletClient || !publicClient) {
        return {
          status: "error",
          error: "Missing required connection details",
        };
      }

      try {
        console.log("Starting swap execution with params:", {
          pair,
          inputAmount,
          slippageTolerance: slippageTolerance.toFixed(),
          chainId: chain.id,
          userAddress: address,
        });

        // 1. Create provider and pool contract
        const provider = new ethers.providers.Web3Provider(
          publicClient.transport
        );
        const poolContract = new ethers.Contract(
          pair.poolAddress,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        // 2. Get pool information
        console.log("Fetching pool info from:", pair.poolAddress);
        const poolInfo = await getPoolInfo(poolContract);
        console.log("Pool info:", poolInfo);

        // 3. Create SDK tokens and ensure correct ordering
        const [token0, token1] = [
          poolInfo.token0.toLowerCase() ===
          pair.inputToken.address.toLowerCase()
            ? toSDKToken(pair.inputToken, chain.id)
            : toSDKToken(pair.outputToken, chain.id),
          poolInfo.token0.toLowerCase() ===
          pair.inputToken.address.toLowerCase()
            ? toSDKToken(pair.outputToken, chain.id)
            : toSDKToken(pair.inputToken, chain.id),
        ];

        console.log("SDK Tokens created:", {
          token0: {
            symbol: token0.symbol,
            address: token0.address,
            decimals: token0.decimals,
          },
          token1: {
            symbol: token1.symbol,
            address: token1.address,
            decimals: token1.decimals,
          },
        });

        // 4. Create Pool instance with correctly ordered tokens
        const pool = new Pool(
          token0,
          token1,
          pair.fee,
          poolInfo.sqrtPriceX96,
          poolInfo.liquidity,
          poolInfo.tick
        );
        console.log("Pool instance created:", {
          fee: pair.fee,
          liquidity: poolInfo.liquidity,
          tick: poolInfo.tick,
        });

        // 5. Create Route
        const route = new Route([pool], token0, token1);
        try {
          const midPrice = route.midPrice;
          console.log("Route created:", {
            path: route.tokenPath.map((t) => t.symbol),
            midPrice: {
              adjusted: midPrice.toSignificant(6),
              numerator: midPrice.numerator.toString(),
              denominator: midPrice.denominator.toString(),
              quote: `1 ${route.input.symbol} = ${midPrice.toSignificant(6)} ${
                route.output.symbol
              }`,
            },
          });
        } catch (error) {
          console.error("Error logging route price:", error);
        }

        // 6. Get quote for the swap
        const parsedAmount = ethers.utils.parseUnits(
          inputAmount,
          pair.inputToken.decimals
        );
        console.log("Parsed input amount:", parsedAmount.toString());

        // Create input amount using the correct token (token0)
        const inputCurrencyAmount = CurrencyAmount.fromRawAmount(
          poolInfo.token0.toLowerCase() ===
            pair.inputToken.address.toLowerCase()
            ? token0
            : token1,
          parsedAmount.toString()
        );

        console.log("Input currency amount:", {
          raw: inputCurrencyAmount.quotient.toString(),
          formatted: inputCurrencyAmount.toExact(),
        });

        // Get quote using SwapQuoter
        console.log(
          "Getting quote from Quoter contract:",
          QUOTER_CONTRACT_ADDRESS
        );

        // Create quote parameters with the correct token order
        const { calldata: quoteCalldata } = SwapQuoter.quoteCallParameters(
          route,
          inputCurrencyAmount,
          TradeType.EXACT_INPUT,
          {
            useQuoterV2: true,
          }
        );

        // Call quoter contract
        console.log("Calling Quoter contract...");
        const quoteCallReturnData = await provider.call({
          to: QUOTER_CONTRACT_ADDRESS,
          data: quoteCalldata,
        });
        console.log("Quote return data:", quoteCallReturnData);

        // Decode the quote
        console.log("Decoding quote response...");
        const [amountOut] = ethers.utils.defaultAbiCoder.decode(
          ["uint256"],
          quoteCallReturnData
        );
        console.log("Decoded amount out:", {
          raw: amountOut.toString(),
          formatted: ethers.utils.formatUnits(
            amountOut,
            pair.outputToken.decimals
          ),
        });

        // 7. Create unchecked trade
        const trade = Trade.createUncheckedTrade({
          route,
          inputAmount: CurrencyAmount.fromRawAmount(
            route.input,
            parsedAmount.toString()
          ),
          outputAmount: CurrencyAmount.fromRawAmount(
            route.output,
            amountOut.toString()
          ),
          tradeType: TradeType.EXACT_INPUT,
        });
        console.log("Trade created:", {
          route: {
            input: route.input.symbol,
            output: route.output.symbol,
          },
          amounts: {
            input: trade.inputAmount.toSignificant(6),
            output: trade.outputAmount.toSignificant(6),
          },
          executionPrice: trade.executionPrice.toSignificant(6),
          priceImpact: trade.priceImpact.toSignificant(2),
        });

        // 8. Get token approval if needed
        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        if (pair.inputToken.symbol !== "ETH") {
          const approved = await getTokenTransferApproval(
            pair.inputToken,
            inputAmount,
            routerAddress,
            provider
          );

          if (!approved) {
            throw new Error("Failed to approve token transfer");
          }
        }

        // 9. Set swap options
        const swapOptions = {
          slippageTolerance,
          deadline: Math.floor(Date.now() / 1000) + 60 * 20,
          recipient: address,
        };

        // 10. Generate swap parameters
        const swapParams = SwapRouter.swapCallParameters(trade, swapOptions);

        // 11. Prepare transaction
        const value =
          pair.inputToken.symbol === "ETH"
            ? ethers.utils
                .parseUnits(inputAmount, pair.inputToken.decimals)
                .toString()
            : "0";

        // 12. Estimate gas with buffer
        const gasEstimate = await publicClient.estimateGas({
          account: address,
          to: routerAddress as `0x${string}`,
          data: swapParams.calldata as `0x${string}`,
          value: BigInt(value),
        });

        const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100); // 20% buffer

        // 13. Send transaction
        const hash = await walletClient.sendTransaction({
          to: routerAddress as `0x${string}`,
          data: swapParams.calldata as `0x${string}`,
          value: BigInt(value),
          gas: gasLimit,
          account: address,
        });

        return {
          status: "pending",
          hash,
        };
      } catch (error: any) {
        console.error("Swap Execution Error:", {
          error,
          message: error.message,
          code: error.code,
          data: error.data,
          stack: error.stack,
        });
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
