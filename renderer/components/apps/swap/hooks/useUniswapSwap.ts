import { useCallback, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useReadContract,
  useWriteContract,
  useSimulateContract,
  useEstimateFeesPerGas,
  useEstimateGas,
} from "wagmi";
import { Percent } from "@uniswap/sdk-core";
import { TokenPair, Token } from "../types";
import { SWAP_ROUTER_ABI } from "../abis";
import { SWAP_ROUTER_ADDRESS, SupportedChainId } from "../constants";
import { useEthersProvider } from "./useEthersProvider";
import { getWrappedToken } from "../types";
import { UNISWAP_V3_POOL_ABI } from "../abis";
import { parseUnits, encodeFunctionData, formatUnits, erc20Abi } from "viem";

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
  estimatedGasLimit: bigint;
  estimatedCost: bigint;
  hasEnoughBalance: boolean;
  formattedCost: string;
  remainingBalance: string;
}

export function useUniswapSwap() {
  const { address, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>({
    required: false,
    approved: false,
    loading: false,
    error: null,
    allowance: undefined,
  });

  // Move allowance check inside the hook with proper typing
  const getAllowance = useCallback(
    async (pair: TokenPair) => {
      if (!address || !chain?.id) return BigInt(0);

      try {
        return (
          (await publicClient?.readContract({
            address: pair.inputToken.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "allowance",
            args: [
              address,
              SWAP_ROUTER_ADDRESS[
                chain.id as SupportedChainId
              ] as `0x${string}`,
            ],
          })) ?? BigInt(0)
        );
      } catch (error) {
        console.error("Allowance check error:", error);
        return BigInt(0);
      }
    },
    [address, chain?.id, publicClient]
  );

  const checkApproval = useCallback(
    async (pair: TokenPair, amount?: string) => {
      if (!amount) return;

      const requiredAllowance = parseUnits(amount, pair.inputToken.decimals);
      const currentAllowance = await getAllowance(pair);
      const hasAllowance = currentAllowance >= requiredAllowance;

      setApprovalStatus({
        required: !hasAllowance,
        approved: hasAllowance,
        loading: false,
        error: null,
        allowance: formatUnits(currentAllowance, pair.inputToken.decimals),
      });
    },
    [getAllowance]
  );

  const approve = useCallback(
    async (pair: TokenPair, amount: string) => {
      try {
        setApprovalStatus((prev) => ({ ...prev, loading: true, error: null }));

        if (!publicClient) {
          throw new Error("Public client not available");
        }

        const amountToApprove = parseUnits(amount, pair.inputToken.decimals);

        const gasEstimate = await publicClient.estimateGas({
          account: address as `0x${string}`,
          to: pair.inputToken.address as `0x${string}`,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [
              SWAP_ROUTER_ADDRESS[
                chain?.id as SupportedChainId
              ] as `0x${string}`,
              amountToApprove,
            ],
          }),
        });

        const hash = await writeContractAsync({
          address: pair.inputToken.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [
            SWAP_ROUTER_ADDRESS[chain?.id as SupportedChainId] as `0x${string}`,
            amountToApprove,
          ],
          gas: (gasEstimate * BigInt(150)) / BigInt(100),
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 2,
        });

        if (!receipt) {
          throw new Error("Transaction receipt not found");
        }
        console.log("Swap confirmed in block:", receipt.blockNumber);

        if (receipt.status === "success") {
          setApprovalStatus((prev) => ({
            ...prev,
            approved: true,
            loading: false,
            allowance: formatUnits(amountToApprove, pair.inputToken.decimals),
          }));
          return true;
        }
        return false;
      } catch (error: any) {
        setApprovalStatus((prev) => ({
          ...prev,
          error: error.shortMessage || error.message,
          loading: false,
        }));
        return false;
      }
    },
    [chain?.id, publicClient, writeContractAsync, getAllowance, address]
  );

  // Fixed gas estimation without nested hooks
  const estimateTransactionCost = useCallback(
    async (txParams: { value: bigint; data: `0x${string}` }) => {
      if (!publicClient || !address || !chain?.id) {
        throw new Error("Client not available");
      }

      try {
        const [gasPrice, gasEstimate] = await Promise.all([
          publicClient.getGasPrice(),
          publicClient.estimateGas({
            account: address as `0x${string}`,
            to: SWAP_ROUTER_ADDRESS[
              chain.id as SupportedChainId
            ] as `0x${string}`,
            data: txParams.data,
            value: txParams.value,
          }),
        ]);

        const estimatedCost = gasEstimate * gasPrice;
        const balance = await publicClient.getBalance({
          address: address as `0x${string}`,
        });

        return {
          estimatedGasLimit: gasEstimate,
          estimatedCost,
          hasEnoughBalance: balance >= estimatedCost + txParams.value,
          formattedCost: formatUnits(estimatedCost, 18),
          remainingBalance: formatUnits(
            balance - estimatedCost - txParams.value,
            18
          ),
        };
      } catch (error) {
        console.error("Gas estimation error:", error);
        throw error;
      }
    },
    [publicClient, address, chain?.id]
  );

  // Fixed revokeApproval using viem
  const revokeApproval = useCallback(
    async (pair: TokenPair): Promise<boolean> => {
      if (!address || !chain?.id || pair.inputToken.symbol === "ETH") {
        return false;
      }

      try {
        setApprovalStatus((prev) => ({ ...prev, loading: true, error: null }));

        const hash = await writeContractAsync({
          address: pair.inputToken.address as `0x${string}`,
          abi: erc20Abi,
          functionName: "approve",
          args: [
            SWAP_ROUTER_ADDRESS[chain.id as SupportedChainId] as `0x${string}`,
            BigInt(0),
          ],
        });

        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        if (receipt?.status === "success") {
          setApprovalStatus((prev) => ({
            ...prev,
            loading: false,
            approved: false,
            required: true,
            allowance: "0",
          }));
          return true;
        }
        return false;
      } catch (error: any) {
        setApprovalStatus((prev) => ({
          ...prev,
          loading: false,
          error: error.shortMessage || error.message,
        }));
        return false;
      }
    },
    [address, chain?.id, publicClient, writeContractAsync]
  );

  // Add this function to check pool liquidity
  const checkPoolLiquidity = async (pair: TokenPair) => {
    if (!publicClient) throw new Error("Provider not available");

    try {
      const liquidity = (await publicClient.readContract({
        address: pair.poolAddress as `0x${string}`,
        abi: UNISWAP_V3_POOL_ABI,
        functionName: "liquidity",
      })) as bigint;

      console.log("Pool liquidity:", {
        poolAddress: pair.poolAddress,
        liquidity: liquidity.toString(),
      });

      if (liquidity === BigInt(0)) {
        throw new Error("Pool has no liquidity");
      }

      return true;
    } catch (error) {
      console.error("Liquidity check failed:", error);
      throw error;
    }
  };

  // Add executeSwap implementation
  const executeSwap = useCallback(
    async (pair: TokenPair, inputAmount: string): Promise<SwapResult> => {
      if (!walletClient || !publicClient || !address || !chain?.id) {
        return { status: "error", error: "Missing required parameters" };
      }

      try {
        const amountIn = parseUnits(inputAmount, pair.inputToken.decimals);
        const routerAddress = SWAP_ROUTER_ADDRESS[
          chain.id as SupportedChainId
        ] as `0x${string}`;

        // Encode swap data
        const data = encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: pair.inputToken.address as `0x${string}`,
              tokenOut: pair.outputToken.address as `0x${string}`,
              fee: pair.fee,
              recipient: address,
              amountIn,
              amountOutMinimum: BigInt(0), // Should calculate properly with slippage
              sqrtPriceLimitX96: BigInt(0),
            },
          ],
        });

        // Send transaction
        const hash = await walletClient.sendTransaction({
          to: routerAddress,
          data,
          value: pair.inputToken.isNative ? amountIn : BigInt(0),
          account: address as `0x${string}`,
        });

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 2, // Wait for 2 confirmations
        });

        console.log("Swap confirmed in block:", receipt.blockNumber);

        return {
          status: receipt.status === "success" ? "success" : "error",
          hash,
          error:
            receipt.status === "success" ? undefined : "Transaction failed",
        };
      } catch (error: any) {
        console.error("Swap error:", error);
        return {
          status: "error",
          error: error.shortMessage || error.message,
        };
      }
    },
    [walletClient, publicClient, address, chain?.id]
  );

  return {
    executeSwap,
    approve,
    checkApproval,
    approvalStatus,
    revokeApproval,
    estimateTransactionCost,
  };
}
