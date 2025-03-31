import { useCallback, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { TokenPair } from "../types";
import { SWAP_ROUTER_ABI } from "../abis";
import {
  SupportedChainId,
  CHAIN_ROUTER_ADDRESSES,
  WETH_ADDRESS,
} from "../constants";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import {
  parseUnits,
  encodeFunctionData,
  formatUnits,
  erc20Abi,
  type Address,
  type Hash,
  BaseError,
} from "viem";

interface ApprovalStatus {
  required: boolean;
  approved: boolean;
  loading: boolean;
  error: string | null;
  allowance?: string;
}

interface SwapResult {
  status: "success" | "error" | "pending";
  hash?: Hash;
  error?: string;
}

interface GasEstimate {
  estimatedGasLimit: bigint;
  estimatedCost: bigint;
  hasEnoughBalance: boolean;
  formattedCost: string;
  remainingBalance: string;
}

interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  fee: number;
  recipient: Address;
  deadline: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96: bigint;
}

const THIRTY_MINUTES = 1800;

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>({
    required: false,
    approved: false,
    loading: false,
    error: null,
    allowance: undefined,
  });

  const getRouterAddress = useCallback((chainId: number): Address => {
    const routerAddress = CHAIN_ROUTER_ADDRESSES[chainId as SupportedChainId];
    if (!routerAddress) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    return routerAddress as Address;
  }, []);

  const getWethAddress = useCallback((chainId: number): Address => {
    const wethAddress = WETH_ADDRESS[chainId as SupportedChainId];
    if (!wethAddress) {
      throw new Error(`No WETH address for chain ID: ${chainId}`);
    }
    return wethAddress as Address;
  }, []);

  const checkApproval = useCallback(
    async (pair: TokenPair, amount?: string) => {
      if (!address || !chain?.id || !publicClient) {
        setApprovalStatus((prev) => ({
          ...prev,
          required: true,
          approved: false,
          loading: false,
          error: "No wallet connected",
        }));
        return;
      }

      if (pair.inputToken.isNative) {
        setApprovalStatus((prev) => ({
          ...prev,
          required: false,
          approved: true,
          loading: false,
          error: null,
        }));
        return;
      }

      try {
        const routerAddress = getRouterAddress(chain.id);
        const allowance = await publicClient.readContract({
          address: pair.inputToken.address as Address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, routerAddress],
        });

        const formattedAllowance = formatUnits(
          allowance,
          pair.inputToken.decimals
        );
        const isApproved = amount
          ? parseFloat(formattedAllowance) >= parseFloat(amount)
          : parseFloat(formattedAllowance) > 0;

        setApprovalStatus((prev) => ({
          ...prev,
          required: !isApproved,
          approved: isApproved,
          loading: false,
          error: null,
          allowance: formattedAllowance,
        }));
      } catch (err) {
        console.error("Error checking approval:", err);
        setApprovalStatus((prev) => ({
          ...prev,
          required: true,
          approved: false,
          loading: false,
          error: "Failed to check token approval",
        }));
      }
    },
    [address, chain?.id, publicClient, getRouterAddress]
  );

  const approve = useCallback(
    async (pair: TokenPair, amount: string): Promise<boolean> => {
      if (!walletClient?.account || !chain?.id || !publicClient) return false;
      if (pair.inputToken.isNative) return true;

      try {
        setApprovalStatus((prev) => ({
          ...prev,
          loading: true,
          error: null,
        }));

        const routerAddress = getRouterAddress(chain.id);
        const amountToApprove = parseUnits(amount, pair.inputToken.decimals);

        // Estimate gas with a buffer
        const gasEstimate = await publicClient.estimateGas({
          account: walletClient.account.address,
          to: pair.inputToken.address as Address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [routerAddress, amountToApprove],
          }),
        });

        // Add 20% buffer to gas estimate
        const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

        // Get current gas price with 10% priority fee
        const gasPrice = await publicClient.getGasPrice();
        const priorityGasPrice = (gasPrice * BigInt(110)) / BigInt(100);

        const hash = await walletClient.writeContract({
          address: pair.inputToken.address as Address,
          abi: erc20Abi,
          functionName: "approve",
          args: [routerAddress, amountToApprove],
          gas: gasLimit,
          gasPrice: priorityGasPrice,
        });

        // Wait for confirmation with shorter timeout
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 30_000, // 30 seconds timeout
        });

        if (receipt.status !== "success") {
          throw new Error("Approval transaction failed");
        }

        await checkApproval(pair, amount);
        return true;
      } catch (err) {
        console.error("Approval error:", err);

        const errorMessage =
          err instanceof Error ? err.message : "Approval failed";
        const isUserRejection =
          errorMessage.toLowerCase().includes("rejected") ||
          errorMessage.toLowerCase().includes("cancel") ||
          errorMessage.toLowerCase().includes("denied") ||
          errorMessage.toLowerCase().includes("user refused");

        if (isUserRejection) {
          // For user rejections, set a specific cancellation error message
          setApprovalStatus((prev) => ({
            ...prev,
            loading: false,
            error: "Transaction was cancelled by user.",
            required: true,
            approved: false,
          }));
        } else {
          // For other errors
          setApprovalStatus((prev) => ({
            ...prev,
            loading: false,
            error: errorMessage,
          }));
        }

        return false;
      }
    },
    [walletClient, chain?.id, publicClient, getRouterAddress, checkApproval]
  );

  const estimateTransactionCost = useCallback(
    async (params: SwapParams): Promise<GasEstimate> => {
      if (!publicClient || !address || !chain?.id) {
        throw new Error("Client not available");
      }

      try {
        const routerAddress = getRouterAddress(chain.id);
        const encodedData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [params],
        });

        const [gasPrice, gasEstimate, balance] = await Promise.all([
          publicClient.getGasPrice(),
          publicClient.estimateGas({
            account: address as Address,
            to: routerAddress,
            data: encodedData,
            value: BigInt(0),
          }),
          publicClient.getBalance({ address: address as Address }),
        ]);

        const estimatedCost = gasEstimate * gasPrice;

        return {
          estimatedGasLimit: gasEstimate,
          estimatedCost,
          hasEnoughBalance: balance >= estimatedCost,
          formattedCost: formatUnits(estimatedCost, 18),
          remainingBalance: formatUnits(balance - estimatedCost, 18),
        };
      } catch (error) {
        console.error("Gas estimation error:", error);
        throw error instanceof BaseError
          ? error
          : new Error("Gas estimation failed");
      }
    },
    [publicClient, address, chain?.id, getRouterAddress]
  );

  const revokeApproval = useCallback(
    async (pair: TokenPair): Promise<boolean> => {
      if (
        !walletClient?.account ||
        !chain?.id ||
        !publicClient ||
        pair.inputToken.isNative
      ) {
        return false;
      }

      try {
        setApprovalStatus((prev) => ({
          ...prev,
          loading: true,
          error: null,
        }));

        const routerAddress = getRouterAddress(chain.id);

        // Prepare the revoke call data
        const revokeData = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [routerAddress, BigInt(0)],
        });

        // Estimate gas with buffer
        const gasEstimate = await publicClient.estimateGas({
          account: walletClient.account.address,
          to: pair.inputToken.address as Address,
          data: revokeData,
        });

        // Add 20% buffer to gas estimate
        const gasLimit = (gasEstimate * BigInt(120)) / BigInt(100);

        // Get current gas price with 10% priority fee
        const gasPrice = await publicClient.getGasPrice();
        const priorityGasPrice = (gasPrice * BigInt(110)) / BigInt(100);

        const hash = await walletClient.writeContract({
          address: pair.inputToken.address as Address,
          abi: erc20Abi,
          functionName: "approve",
          args: [routerAddress, BigInt(0)],
          gas: gasLimit,
          gasPrice: priorityGasPrice,
        });

        // Wait for confirmation with shorter timeout
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 30_000, // 30 seconds timeout
        });

        if (receipt.status !== "success") {
          throw new Error("Revoke transaction failed");
        }

        await checkApproval(pair);

        setApprovalStatus((prev) => ({
          ...prev,
          loading: false,
          error: null,
          approved: false,
          required: true,
          allowance: "0",
        }));

        return true;
      } catch (err) {
        console.error("Revoke approval error:", err);
        setApprovalStatus((prev) => ({
          ...prev,
          loading: false,
          error:
            err instanceof Error ? err.message : "Failed to revoke approval",
        }));
        return false;
      }
    },
    [walletClient, chain?.id, publicClient, getRouterAddress, checkApproval]
  );

  const checkPoolLiquidity = useCallback(
    async (pair: TokenPair): Promise<boolean> => {
      if (!publicClient) throw new Error("Client not available");

      try {
        const liquidity = (await publicClient.readContract({
          address: pair.poolAddress as Address,
          abi: UNISWAP_V3_POOL_ABI,
          functionName: "liquidity",
        })) as bigint;

        if (liquidity === BigInt(0)) {
          throw new Error("Pool has no liquidity");
        }

        return true;
      } catch (error) {
        console.error("Liquidity check failed:", error);
        throw error instanceof BaseError
          ? error
          : new Error("Liquidity check failed");
      }
    },
    [publicClient]
  );

  const executeSwap = useCallback(
    async (pair: TokenPair, inputAmount: string): Promise<SwapResult> => {
      if (!walletClient?.account || !chain?.id || !publicClient) {
        return { status: "error", error: "No wallet connected" };
      }

      try {
        const routerAddress = getRouterAddress(chain.id);
        const wethAddress = getWethAddress(chain.id);
        const parsedAmount = parseUnits(inputAmount, pair.inputToken.decimals);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + THIRTY_MINUTES);

        // Check user's ETH balance
        if (pair.inputToken.isNative) {
          const balance = await publicClient.getBalance({
            address: address as Address,
          });
          if (balance < parsedAmount) {
            return {
              status: "error",
              error: "Insufficient ETH balance",
            };
          }
        }

        // Check pool liquidity
        try {
          await checkPoolLiquidity(pair);
        } catch (error) {
          return {
            status: "error",
            error: "Insufficient pool liquidity",
          };
        }

        let hash: Hash;

        if (pair.inputToken.isNative) {
          // For ETH input swaps
          const params: SwapParams = {
            tokenIn: wethAddress,
            tokenOut: pair.outputToken.address as Address,
            fee: pair.fee,
            recipient: walletClient.account.address,
            deadline,
            amountIn: parsedAmount,
            amountOutMinimum: BigInt(0),
            sqrtPriceLimitX96: BigInt(0),
          };

          // First, simulate the swap to ensure it will succeed
          try {
            await publicClient.simulateContract({
              address: routerAddress,
              abi: SWAP_ROUTER_ABI,
              functionName: "exactInputSingle",
              args: [params],
              value: parsedAmount,
              account: address as Address,
            });
          } catch (error) {
            console.error("Swap simulation failed:", error);
            return {
              status: "error",
              error: "Swap simulation failed. The transaction would revert.",
            };
          }

          // If simulation succeeds, proceed with the actual swap
          hash = await walletClient.writeContract({
            address: routerAddress,
            abi: SWAP_ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [params],
            value: parsedAmount,
          });

          // Wait for transaction confirmation
          try {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: 1,
              timeout: 60_000,
            });

            if (receipt.status === "success") {
              return { status: "success", hash };
            } else {
              return {
                status: "error",
                error: "Transaction failed",
                hash,
              };
            }
          } catch (error) {
            console.error("Transaction confirmation error:", error);
            return {
              status: "error",
              error: "Failed to confirm transaction",
              hash,
            };
          }
        } else if (pair.outputToken.isNative) {
          // For ETH output swaps
          const params: SwapParams = {
            tokenIn: pair.inputToken.address as Address,
            tokenOut: wethAddress,
            fee: pair.fee,
            recipient: routerAddress,
            deadline,
            amountIn: parsedAmount,
            amountOutMinimum: BigInt(0),
            sqrtPriceLimitX96: BigInt(0),
          };

          // Prepare multicall data
          const multicallData = [
            encodeFunctionData({
              abi: SWAP_ROUTER_ABI,
              functionName: "exactInputSingle",
              args: [params],
            }),
            encodeFunctionData({
              abi: SWAP_ROUTER_ABI,
              functionName: "unwrapWETH9",
              args: [BigInt(0), walletClient.account.address],
            }),
          ];

          hash = await walletClient.writeContract({
            address: routerAddress,
            abi: SWAP_ROUTER_ABI,
            functionName: "multicall",
            args: [multicallData],
          });

          // Wait for transaction confirmation
          try {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: 1,
              timeout: 60_000, // 60 seconds
            });

            if (receipt.status === "success") {
              return { status: "success", hash };
            } else {
              return {
                status: "error",
                error: "Transaction failed",
                hash,
              };
            }
          } catch (error) {
            console.error("Transaction confirmation error:", error);
            return {
              status: "error",
              error: "Failed to confirm transaction",
              hash,
            };
          }
        } else {
          // For token to token swaps
          const params: SwapParams = {
            tokenIn: pair.inputToken.address as Address,
            tokenOut: pair.outputToken.address as Address,
            fee: pair.fee,
            recipient: walletClient.account.address,
            deadline,
            amountIn: parsedAmount,
            amountOutMinimum: BigInt(0),
            sqrtPriceLimitX96: BigInt(0),
          };

          hash = await walletClient.writeContract({
            address: routerAddress,
            abi: SWAP_ROUTER_ABI,
            functionName: "exactInputSingle",
            args: [params],
          });

          // Wait for transaction confirmation
          try {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash,
              confirmations: 1,
              timeout: 60_000, // 60 seconds
            });

            if (receipt.status === "success") {
              return { status: "success", hash };
            } else {
              return {
                status: "error",
                error: "Transaction failed",
                hash,
              };
            }
          } catch (error) {
            console.error("Transaction confirmation error:", error);
            return {
              status: "error",
              error: "Failed to confirm transaction",
              hash,
            };
          }
        }
      } catch (err) {
        console.error("Swap error:", err);
        if (err instanceof BaseError) {
          const reason = err.shortMessage || err.message;
          if (reason.includes("STF")) {
            return {
              status: "error",
              error:
                "Safe Transfer Failed: The swap could not be executed. Please check your balance and the pool liquidity.",
            };
          }
        }
        return {
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error occurred",
        };
      }
    },
    [
      walletClient,
      chain?.id,
      publicClient,
      getRouterAddress,
      getWethAddress,
      address,
      checkPoolLiquidity,
    ]
  );

  const clearErrors = useCallback(() => {
    setApprovalStatus((prev) => ({
      ...prev,
      error: null,
      loading: false,
    }));
  }, []);

  return {
    executeSwap,
    approve,
    checkApproval,
    approvalStatus,
    revokeApproval,
    estimateTransactionCost,
    checkPoolLiquidity,
    clearErrors,
  };
}
