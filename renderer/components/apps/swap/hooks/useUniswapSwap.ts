import { useCallback, useState } from "react";
import { ethers } from "ethersv5";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Percent } from "@uniswap/sdk-core";
import { TokenPair, Token } from "../types";
import { SWAP_ROUTER_ABI, ERC20_ABI } from "../abis";
import { SWAP_ROUTER_ADDRESS, SupportedChainId } from "../constants";
import { useEthersProvider } from "./useEthersProvider";
import { getWrappedToken } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";

interface ApprovalStatus {
  required: boolean;
  approved: boolean;
  loading: boolean;
  error: string | null;
  allowance?: string;
}

interface SwapResult {
  status: "success" | "error" | "pending";
  hash?: `0x${string}`;
  error?: string;
}

interface GasEstimate {
  estimatedGasLimit: ethers.BigNumber;
  estimatedCost: ethers.BigNumber;
  hasEnoughBalance: boolean;
  formattedCost: string;
  remainingBalance: string;
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
    allowance: undefined,
  });

  const checkApproval = useCallback(
    async (pair: TokenPair, amount?: string) => {
      if (!address || !chain?.id || !provider) {
        setApprovalStatus({
          required: false,
          approved: false,
          loading: false,
          error: null,
          allowance: undefined,
        });
        return;
      }

      try {
        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const tokenContract = new ethers.Contract(
          pair.inputToken.address,
          ERC20_ABI,
          provider
        );

        // Get both allowance and required approval
        const [allowance, needsApproval] = await Promise.all([
          pair.inputToken.symbol === "ETH"
            ? Promise.resolve(undefined)
            : tokenContract
                .allowance(address, routerAddress)
                .then((val: ethers.BigNumber) =>
                  ethers.utils.formatUnits(val, pair.inputToken.decimals)
                ),
          amount
            ? checkApprovalNeeded(
                pair.inputToken,
                amount,
                routerAddress,
                provider,
                address
              )
            : Promise.resolve(false),
        ]);

        setApprovalStatus({
          required: needsApproval,
          approved: !needsApproval,
          loading: false,
          error: null,
          allowance,
        });
      } catch (e: any) {
        setApprovalStatus({
          required: false,
          approved: false,
          loading: false,
          error: e.message,
          allowance: undefined,
        });
      }
    },
    [address, chain?.id, provider]
  );

  const approve = useCallback(
    async (pair: TokenPair, amount: string): Promise<boolean> => {
      if (!address || !chain?.id || !provider || !walletClient) {
        return false;
      }

      try {
        setApprovalStatus((prev) => ({ ...prev, loading: true }));

        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const approved = await getTokenTransferApproval(
          pair.inputToken,
          amount,
          routerAddress,
          provider,
          walletClient
        );

        // Immediately check and update the new allowance
        if (approved) {
          const tokenContract = new ethers.Contract(
            pair.inputToken.address,
            ERC20_ABI,
            provider
          );
          const newAllowance = await tokenContract.allowance(
            address,
            routerAddress
          );

          setApprovalStatus((prev) => ({
            ...prev,
            loading: false,
            approved: true,
            required: false,
            allowance: ethers.utils.formatUnits(
              newAllowance,
              pair.inputToken.decimals
            ),
          }));
        }

        return approved;
      } catch (e: any) {
        setApprovalStatus((prev) => ({
          ...prev,
          loading: false,
          error: e.message,
        }));
        return false;
      }
    },
    [address, chain?.id, provider, walletClient]
  );

  const estimateTransactionCost = async (txParams: {
    from: string;
    to: string;
    data: string;
    value: ethers.BigNumber;
  }): Promise<GasEstimate> => {
    if (!provider) {
      throw new Error("Provider not available");
    }

    try {
      // Get gas limit
      const gasLimit = await provider.estimateGas(txParams);

      // Add 20% buffer to gas limit
      const gasLimitWithBuffer = gasLimit.mul(120).div(100);

      // Get current gas price
      const gasPrice = await provider.getGasPrice();

      // Calculate total gas cost
      const gasCost = gasLimitWithBuffer.mul(gasPrice);

      // Calculate total cost (gas + value)
      const totalCost = gasCost.add(txParams.value);

      // Get user's ETH balance
      const balance = await provider.getBalance(txParams.from);

      // Check if user has enough balance
      const hasEnoughBalance = balance.gte(totalCost);

      // Format values for display
      const formattedCost = ethers.utils.formatEther(totalCost);
      const remainingBalance = ethers.utils.formatEther(balance.sub(totalCost));

      return {
        estimatedGasLimit: gasLimitWithBuffer,
        estimatedCost: totalCost,
        hasEnoughBalance,
        formattedCost,
        remainingBalance,
      };
    } catch (error) {
      console.error("Gas estimation error:", error);
      throw error;
    }
  };

  const executeSwap = useCallback(
    async (
      pair: TokenPair,
      inputAmount: string,
      slippageTolerance: Percent = new Percent(50, 10_000)
    ): Promise<SwapResult> => {
      if (!provider || !address || !chain?.id) {
        throw new Error("Provider not ready or missing requirements");
      }

      try {
        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const routerInterface = new ethers.utils.Interface(SWAP_ROUTER_ABI);

        // Handle ETH/WETH conversion
        const isETHInput = pair.inputToken.isNative;
        const isETHOutput = pair.outputToken.isNative;

        // Get wrapped versions for actual swap
        const actualInputToken = getWrappedToken(pair.inputToken, chain.id);
        const actualOutputToken = getWrappedToken(pair.outputToken, chain.id);

        // Calculate value to send
        const value = isETHInput
          ? ethers.utils
              .parseUnits(inputAmount, pair.inputToken.decimals)
              .toString()
          : "0";

        // Prepare swap parameters
        const params = {
          tokenIn: actualInputToken.address,
          tokenOut: actualOutputToken.address,
          fee: pair.fee,
          recipient: isETHOutput ? routerAddress : address,
          amountIn: ethers.utils
            .parseUnits(inputAmount, pair.inputToken.decimals)
            .toString(),
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        };

        console.log("Swap parameters:", params);

        // Build transaction steps
        const steps = [];

        // Add wrap ETH step if needed
        if (isETHInput) {
          const wrapStep = routerInterface.encodeFunctionData("wrapETH", [
            params.amountIn,
          ]);
          steps.push(wrapStep);
          console.log("Added WETH wrap step");
        }

        // Add swap step
        const swapStep = routerInterface.encodeFunctionData(
          "exactInputSingle",
          [params]
        );
        steps.push(swapStep);
        console.log("Added swap step");

        // Add unwrap WETH step if needed
        if (isETHOutput) {
          const unwrapStep = routerInterface.encodeFunctionData("unwrapWETH9", [
            params.amountOutMinimum,
            address,
          ]);
          steps.push(unwrapStep);
          console.log("Added WETH unwrap step");
        }

        // Encode multicall if multiple steps
        const data =
          steps.length > 1
            ? routerInterface.encodeFunctionData("multicall", [steps])
            : steps[0];

        console.log("Transaction data:", {
          steps: steps.length,
          isMulticall: steps.length > 1,
          data,
        });

        // Check gas costs before proceeding
        const txParams = {
          from: address,
          to: routerAddress,
          data,
          value: ethers.BigNumber.from(value),
        };

        const gasEstimate = await estimateTransactionCost(txParams);

        if (!gasEstimate.hasEnoughBalance) {
          throw new Error(
            `Insufficient ETH for gas. Required: ${gasEstimate.formattedCost} ETH`
          );
        }

        console.log("Gas estimate:", {
          requiredAmount: gasEstimate.formattedCost,
          remainingBalance: gasEstimate.remainingBalance,
          hasEnoughBalance: gasEstimate.hasEnoughBalance,
        });

        if (!walletClient) {
          throw new Error("Wallet client not found");
        }

        // Send transaction
        const hash = await walletClient.sendTransaction({
          to: routerAddress as `0x${string}`,
          data: data as `0x${string}`,
          value: BigInt(value),
          account: address as `0x${string}`,
        });

        console.log("Transaction sent:", { hash });

        // Wait for transaction confirmation with increased timeout
        if (provider) {
          let retryCount = 0;
          const maxRetries = 3;

          while (retryCount < maxRetries) {
            try {
              const receipt = await provider.waitForTransaction(hash, 1, 60000);

              return {
                status: receipt.status === 1 ? "success" : "error",
                hash: receipt.transactionHash as `0x${string}`,
                error: receipt.status === 1 ? undefined : "Transaction failed",
              };
            } catch (waitError: any) {
              // If it's not a timeout error, throw immediately
              if (!waitError.message?.includes("Timed out")) {
                throw waitError;
              }

              retryCount++;

              // Check transaction status directly
              try {
                const tx = await provider.getTransaction(hash);

                if (tx?.blockNumber) {
                  return {
                    status: "success",
                    hash,
                  };
                }
              } catch (checkError) {}
            }
          }

          // If we've exhausted retries but transaction exists
          try {
            const tx = await provider.getTransaction(hash);
            if (tx) {
              return {
                status: "pending",
                hash,
                error: "Transaction submitted but confirmation timed out",
              };
            }
          } catch (finalCheckError) {}
        }

        // If no provider or all retries failed
        return {
          status: "pending",
          hash,
          error: "Transaction submitted but status unknown",
        };
      } catch (error: any) {
        console.error("Swap execution error:", {
          message: error.message,
          code: error.code,
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

  const revokeApproval = useCallback(
    async (pair: TokenPair): Promise<boolean> => {
      if (
        !address ||
        !chain?.id ||
        !provider ||
        !walletClient ||
        pair.inputToken.symbol === "ETH"
      ) {
        return false;
      }

      try {
        setApprovalStatus((prev) => ({ ...prev, loading: true }));

        const routerAddress = SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId];
        const tokenContract = new ethers.Contract(
          pair.inputToken.address,
          ERC20_ABI,
          provider
        );

        // Set allowance to 0 using walletClient
        const tx = await walletClient.sendTransaction({
          to: pair.inputToken.address as `0x${string}`,
          data: tokenContract.interface.encodeFunctionData("approve", [
            routerAddress,
            0,
          ]) as `0x${string}`,
          account: walletClient.account.address,
        });

        await provider.waitForTransaction(tx, 1, 60000);

        // Immediately check and update the new allowance
        const newAllowance = await tokenContract.allowance(
          address,
          routerAddress
        );

        setApprovalStatus((prev) => ({
          ...prev,
          loading: false,
          approved: false,
          required: true,
          allowance: ethers.utils.formatUnits(
            newAllowance,
            pair.inputToken.decimals
          ),
        }));

        window.seedConnector.showToast({
          type: "success",
          message: "Approval revoked successfully",
        });

        return true;
      } catch (e: any) {
        console.error("Error revoking approval:", e);
        setApprovalStatus((prev) => ({
          ...prev,
          loading: false,
          error: e.message,
        }));

        window.seedConnector.showToast({
          type: "error",
          message: e.message || "Failed to revoke approval",
        });

        return false;
      }
    },
    [address, chain?.id, provider, walletClient]
  );

  // Add this function to check pool liquidity
  const checkPoolLiquidity = async (pair: TokenPair) => {
    if (!provider) {
      throw new Error("Provider not available");
    }

    try {
      const poolContract = new ethers.Contract(
        pair.poolAddress,
        UNISWAP_V3_POOL_ABI,
        provider
      );

      const liquidity = await poolContract.liquidity();
      console.log("Pool liquidity:", {
        poolAddress: pair.poolAddress,
        liquidity: liquidity.toString(),
      });

      if (liquidity.eq(0)) {
        throw new Error("Pool has no liquidity");
      }

      return true;
    } catch (error) {
      console.error("Liquidity check failed:", error);
      throw error;
    }
  };

  return {
    executeSwap,
    approve,
    checkApproval,
    approvalStatus,
    revokeApproval,
    estimateTransactionCost,
  };
}
