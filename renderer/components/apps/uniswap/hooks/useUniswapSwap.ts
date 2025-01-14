import { useCallback, useState } from "react";
import { ethers } from "ethersv5";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Percent } from "@uniswap/sdk-core";
import { TokenPair, Token } from "../types";
import { SWAP_ROUTER_ABI, ERC20_ABI } from "../abis";
import { SWAP_ROUTER_ADDRESS, SupportedChainId } from "../constants";
import { useEthersProvider } from "./useEthersProvider";

interface ApprovalStatus {
  required: boolean;
  approved: boolean;
  loading: boolean;
  error: string | null;
}

interface SwapResult {
  status: "success" | "error" | "pending";
  hash?: `0x${string}`;
  error?: string;
}

async function getTokenTransferApproval(
  token: Token,
  amount: string,
  spender: string,
  provider: ethers.providers.Provider,
  walletClient: any
) {
  if (token.symbol === "ETH") return true;

  try {
    const tokenContract = new ethers.Contract(
      token.address,
      ERC20_ABI,
      provider
    );

    // Parse the exact amount needed
    const amountToApprove = ethers.utils.parseUnits(amount, token.decimals);

    // Check current allowance
    const currentAllowance = await tokenContract.allowance(
      walletClient.account.address,
      spender
    );

    // If current allowance is sufficient, no need to approve
    if (currentAllowance.gte(amountToApprove)) {
      return true;
    }

    // If there's an existing insufficient allowance, reset it first
    if (currentAllowance.gt(0)) {
      console.log("[Approval] Resetting existing allowance to zero");
      const zeroTx = await walletClient.sendTransaction({
        to: token.address as `0x${string}`,
        data: tokenContract.interface.encodeFunctionData("approve", [
          spender,
          0,
        ]) as `0x${string}`,
        account: walletClient.account.address,
      });

      const zeroReceipt = await provider.waitForTransaction(zeroTx, 1, 60000);
      if (!zeroReceipt.status) {
        throw new Error("Failed to reset allowance");
      }
    }

    // Add 10% buffer for slippage and gas price fluctuations
    const bufferMultiplier = 1.1; // 10% buffer
    const amountWithBuffer = amountToApprove
      .mul(ethers.utils.parseUnits(bufferMultiplier.toFixed(1), 1))
      .div(ethers.utils.parseUnits("1", 1));

    console.log("[Approval] Setting exact allowance with buffer");
    const tx = await walletClient.sendTransaction({
      to: token.address as `0x${string}`,
      data: tokenContract.interface.encodeFunctionData("approve", [
        spender,
        amountWithBuffer,
      ]) as `0x${string}`,
      account: walletClient.account.address,
    });

    const receipt = await provider.waitForTransaction(tx, 1, 60000);
    if (!receipt.status) {
      throw new Error("Approval transaction failed");
    }

    // Verify the allowance
    const newAllowance = await tokenContract.allowance(
      walletClient.account.address,
      spender
    );

    if (newAllowance.lt(amountToApprove)) {
      throw new Error("Allowance not set correctly");
    }

    return true;
  } catch (e) {
    console.error("[Approval] Error:", e);
    return false;
  }
}

async function checkApprovalNeeded(
  token: Token,
  amount: string,
  spender: string,
  provider: ethers.providers.Provider,
  address: string
): Promise<boolean> {
  if (token.symbol === "ETH") return false;

  try {
    const tokenContract = new ethers.Contract(
      token.address,
      ERC20_ABI,
      provider
    );
    const amountWei = ethers.utils.parseUnits(amount, token.decimals);
    const allowance = await tokenContract.allowance(address, spender);
    return allowance.lt(amountWei);
  } catch (e) {
    console.error("Error checking approval:", e);
    return true; // Assume approval needed on error
  }
}

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const provider = useEthersProvider();
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>({
    required: false,
    approved: false,
    loading: false,
    error: null,
  });

  const checkApproval = useCallback(
    async (pair: TokenPair, amount: string) => {
      if (
        !address ||
        !chain?.id ||
        !provider ||
        pair.inputToken.symbol === "ETH"
      ) {
        setApprovalStatus({
          required: false,
          approved: true,
          loading: false,
          error: null,
        });
        return;
      }

      try {
        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const needsApproval = await checkApprovalNeeded(
          pair.inputToken,
          amount,
          routerAddress,
          provider,
          address
        );

        setApprovalStatus({
          required: needsApproval,
          approved: !needsApproval,
          loading: false,
          error: null,
        });
      } catch (e: any) {
        setApprovalStatus({
          required: true,
          approved: false,
          loading: false,
          error: e.message,
        });
      }
    },
    [address, chain?.id, provider]
  );

  const approve = useCallback(
    async (pair: TokenPair, amount: string): Promise<boolean> => {
      if (!address || !chain?.id || !walletClient || !provider) {
        throw new Error("Wallet not connected");
      }

      setApprovalStatus((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const approved = await getTokenTransferApproval(
          pair.inputToken,
          amount,
          routerAddress,
          provider,
          walletClient
        );

        setApprovalStatus({
          required: !approved,
          approved: approved,
          loading: false,
          error: null,
        });

        return approved;
      } catch (e: any) {
        setApprovalStatus({
          required: true,
          approved: false,
          loading: false,
          error: e.message,
        });
        return false;
      }
    },
    [address, chain?.id, provider, walletClient]
  );

  const executeSwap = useCallback(
    async (
      pair: TokenPair,
      inputAmount: string,
      slippageTolerance: Percent = new Percent(50, 10_000)
    ): Promise<SwapResult> => {
      if (!address || !chain?.id || !walletClient || !provider) {
        throw new Error("Wallet not connected");
      }

      try {
        console.log("[Swap] Starting swap execution", {
          pair,
          inputAmount,
          slippage: slippageTolerance.toFixed(),
        });

        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const routerInterface = new ethers.utils.Interface(SWAP_ROUTER_ABI);

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
        const gasEstimate = await provider.estimateGas({
          from: address,
          to: routerAddress,
          data: data,
          value: ethers.BigNumber.from(value),
        });

        // Add 20% buffer to gas estimate
        const gasBuffer = gasEstimate.mul(120).div(100);

        // Send transaction
        const hash = await walletClient.sendTransaction({
          to: routerAddress as `0x${string}`,
          data: data as `0x${string}`,
          value: BigInt(value),
          gas: BigInt(gasBuffer.toString()),
          account: address,
        });

        console.log("[Swap] Transaction submitted", {
          hash,
          chainId: chain.id,
          from: address,
          to: routerAddress,
        });

        // Wait for transaction confirmation with increased timeout
        if (provider) {
          console.log("[Swap] Waiting for transaction receipt...");

          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount < maxRetries) {
            try {
              const receipt = await provider.waitForTransaction(hash, 1, 60000);

              console.log("[Swap] Transaction receipt received", {
                receipt,
                status: receipt.status,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed?.toString(),
              });

              return {
                status: receipt.status === 1 ? "success" : "error",
                hash: receipt.transactionHash as `0x${string}`,
                error: receipt.status === 1 ? undefined : "Transaction failed",
              };
            } catch (waitError: any) {
              console.log("[Swap] Wait attempt failed", {
                attempt: retryCount + 1,
                error: waitError.message,
              });

              // If it's not a timeout error, throw immediately
              if (!waitError.message?.includes("Timed out")) {
                throw waitError;
              }

              retryCount++;

              // Check transaction status directly
              try {
                const tx = await provider.getTransaction(hash);
                console.log("[Swap] Transaction status check", {
                  hash,
                  exists: !!tx,
                  blockNumber: tx?.blockNumber,
                });

                if (tx?.blockNumber) {
                  return {
                    status: "success",
                    hash,
                  };
                }
              } catch (checkError) {
                console.error(
                  "[Swap] Transaction status check failed",
                  checkError
                );
              }
            }
          }

          // If we've exhausted retries but transaction exists
          try {
            const tx = await provider.getTransaction(hash);
            if (tx) {
              console.log(
                "[Swap] Transaction exists but receipt wait timed out",
                {
                  hash,
                  blockNumber: tx.blockNumber,
                }
              );
              return {
                status: "pending",
                hash,
                error: "Transaction submitted but confirmation timed out",
              };
            }
          } catch (finalCheckError) {
            console.error(
              "[Swap] Final transaction check failed",
              finalCheckError
            );
          }
        }

        // If no provider or all retries failed
        return {
          status: "pending",
          hash,
          error: "Transaction submitted but status unknown",
        };
      } catch (error: any) {
        console.error("[Swap] Error:", {
          error,
          message: error.message,
          data: error.data,
          stack: error.stack,
        });

        if (error.message?.includes("Timed out")) {
          return {
            status: "pending",
            hash: error.hash,
            error: "Transaction pending - please check your wallet for status",
          };
        }

        return {
          status: "error",
          error: error.message || "Failed to execute swap",
        };
      }
    },
    [address, chain?.id, provider, walletClient]
  );

  return { executeSwap, approve, checkApproval, approvalStatus };
}
