import { useCallback } from "react";
import { ethers } from "ethersv5";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Percent } from "@uniswap/sdk-core";
import { TokenPair, Token } from "../types";
import { SWAP_ROUTER_ABI, ERC20_ABI } from "../abis";
import { SWAP_ROUTER_ADDRESS, SupportedChainId } from "../constants";

interface SwapResult {
  status: "pending" | "error";
  hash?: `0x${string}`;
  error?: string;
}

async function getTokenTransferApproval(
  token: Token,
  amount: string,
  spender: string,
  publicClient: any,
  walletClient: any
) {
  if (token.symbol === "ETH") return true;

  try {
    const tokenContract = new ethers.Contract(
      token.address,
      ERC20_ABI,
      new ethers.providers.Web3Provider(publicClient.transport)
    );

    // First check current allowance
    const currentAllowance = await tokenContract.allowance(
      await walletClient.account.address,
      spender
    );

    if (currentAllowance.gt(0)) {
      // If there's an existing allowance, approve zero first
      const zeroTx = await tokenContract.approve(spender, 0);
      await zeroTx.wait();
    }

    // Then approve the maximum amount
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
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const executeSwap = useCallback(
    async (
      pair: TokenPair,
      inputAmount: string,
      slippageTolerance: Percent = new Percent(50, 10_000)
    ): Promise<SwapResult> => {
      if (!address || !chain?.id || !walletClient || !publicClient) {
        throw new Error("Wallet not connected");
      }

      try {
        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const routerInterface = new ethers.utils.Interface(SWAP_ROUTER_ABI);

        // Get token approval if needed
        if (pair.inputToken.symbol !== "ETH") {
          const approved = await getTokenTransferApproval(
            pair.inputToken,
            inputAmount,
            routerAddress,
            publicClient,
            walletClient
          );

          if (!approved) {
            throw new Error("Failed to approve token transfer");
          }
        }

        // Calculate the value (ETH amount) to send
        const value =
          pair.inputToken.symbol === "ETH"
            ? ethers.utils
                .parseUnits(inputAmount, pair.inputToken.decimals)
                .toString()
            : "0";

        // Prepare swap parameters
        const params = {
          tokenIn: pair.inputToken.address,
          tokenOut: pair.outputToken.address,
          fee: pair.fee,
          recipient: address,
          amountIn: ethers.utils
            .parseUnits(inputAmount, pair.inputToken.decimals)
            .toString(),
          amountOutMinimum: 0, // We'll add proper slippage calculation
          sqrtPriceLimitX96: 0,
        };

        // Encode the swap function call
        const data = routerInterface.encodeFunctionData("exactInputSingle", [
          params,
        ]);

        // Estimate gas
        const gasEstimate = await publicClient.estimateGas({
          account: address,
          to: routerAddress as `0x${string}`,
          data: data as `0x${string}`,
          value: BigInt(value),
        });

        // Add 20% buffer to gas estimate
        const gasBuffer = (gasEstimate * BigInt(120)) / BigInt(100);

        // Send transaction
        const hash = await walletClient.sendTransaction({
          to: routerAddress as `0x${string}`,
          data: data as `0x${string}`,
          value: BigInt(value),
          gas: gasBuffer,
          account: address,
        });

        return {
          status: "pending",
          hash,
        };
      } catch (error: any) {
        console.error("Swap Error:", {
          error,
          message: error.message,
          data: error.data,
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
