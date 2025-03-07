import { useState, useEffect, useMemo, useCallback } from "react";
import { Container, Row, Col, Form } from "react-bootstrap";
import { useAccount, usePublicClient } from "wagmi";
import { Pool } from "@uniswap/v3-sdk";
import { CHAIN_POOLS, CHAIN_TOKENS } from "./constants";
import { UNISWAP_V3_POOL_ABI } from "./abis";
import { usePoolPrice } from "./hooks/usePoolPrice";
import PriceDisplay from "./components/PriceDisplay";
import { Token, toSDKToken, SwapStatus } from "./types";
import { useUniswapSwap } from "./hooks/useUniswapSwap";
import { SwapButton } from "./components/SwapButton";
import { TransactionController } from "./controllers/TransactionController";
import { TokenSelect } from "./components/TokenSelect";
import { Settings } from "lucide-react";
import { RevokeModal } from "./components/RevokeModal";
import { erc20Abi, formatUnits, type Address, getContract } from "viem";

function formatAllowance(allowance: string | undefined): string {
  if (!allowance) return "0";
  const num = parseFloat(allowance);
  if (num > 1_000_000) return "∞";
  return num.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function GasWarning({ ethBalance }: { ethBalance: string }) {
  const lowBalanceThreshold = 0.001; // 0.001 ETH
  const balance = parseFloat(ethBalance);

  if (ethBalance !== "0" && balance <= lowBalanceThreshold) {
    return (
      <div className="tw-bg-[#ffb019]/10 tw-border tw-border-[#ffb019]/20 tw-rounded-xl tw-p-4 tw-my-4 tw-flex tw-gap-4 tw-items-start tw-relative tw-z-1">
        <div className="tw-text-xl tw-leading-none">⚠️</div>
        <div className="tw-flex-1">
          <div className="tw-text-[#ffb019] tw-font-semibold tw-mb-1">
            Low ETH Balance
          </div>
          <div className="tw-text-white/70 tw-text-sm tw-leading-relaxed">
            Your ETH balance (
            <span className="tw-font-mono tw-font-medium">{ethBalance}</span>{" "}
            ETH) is too low for gas fees. Add more ETH to perform transactions.
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function UniswapApp() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const chainId = chain?.id || 1;

  // Use chain-specific token pairs
  const [selectedPair, setSelectedPair] = useState(
    CHAIN_POOLS[chainId as keyof typeof CHAIN_POOLS][0]
  );

  // Create a fixed display pair that doesn't change with swapping but respects chain
  const displayPair = useMemo(() => selectedPair, [selectedPair]);
  const {
    forward,
    reverse,
    loading: priceLoading,
    error: priceError,
  } = usePoolPrice(displayPair);
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [swapLoading, setSwapLoading] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [tokenBalances, setTokenBalances] = useState<{
    [address: string]: string | null;
  }>({});
  // Add state for pool availability warning
  const [poolWarning, setPoolWarning] = useState<{
    message: string;
    token1: Token;
    token2: Token;
    countdown: number;
  } | null>(null);

  // Add new state for available tokens
  const availableTokens = useMemo(() => {
    if (!chain?.id) return [];
    return Object.values(CHAIN_TOKENS[chain.id as keyof typeof CHAIN_TOKENS]);
  }, [chain?.id]);

  // Function to find pool for token pair
  const findPool = useCallback(
    (tokenA: Token, tokenB: Token) => {
      if (!chain?.id) return null;

      const pools = CHAIN_POOLS[chain.id as keyof typeof CHAIN_POOLS];
      return pools.find(
        (pool) =>
          (pool.inputToken.address.toLowerCase() ===
            tokenA.address.toLowerCase() &&
            pool.outputToken.address.toLowerCase() ===
              tokenB.address.toLowerCase()) ||
          (pool.inputToken.address.toLowerCase() ===
            tokenB.address.toLowerCase() &&
            pool.outputToken.address.toLowerCase() ===
              tokenA.address.toLowerCase())
      );
    },
    [chain?.id]
  );

  // Update checkPoolAvailability to use viem/wagmi
  const checkPoolAvailability = useCallback(
    async (token1: Token, token2: Token) => {
      if (!chain?.id || !publicClient) return false;

      const pool = findPool(token1, token2);
      if (!pool) {
        setPoolWarning({
          message: `No liquidity pool available for ${token1.symbol}/${token2.symbol}`,
          token1,
          token2,
          countdown: 5,
        });

        // Reset to default pair after 5 seconds
        const resetTimer = setTimeout(() => {
          setPoolWarning(null);
          // Only reset if this is still the active warning
          setSelectedPair((current) => {
            if (
              current.inputToken.address === token1.address &&
              current.outputToken.address === token2.address
            ) {
              return CHAIN_POOLS[chainId as keyof typeof CHAIN_POOLS][0];
            }
            return current;
          });
        }, 5000);

        return false;
      }

      try {
        const [code, poolContract] = await Promise.all([
          publicClient.getBytecode({ address: pool.poolAddress as Address }),
          getContract({
            address: pool.poolAddress as Address,
            abi: UNISWAP_V3_POOL_ABI,
            client: publicClient,
          }),
        ]);

        if (!code || code === "0x") {
          setPoolWarning({
            message: `No liquidity pool contract found for ${token1.symbol}/${token2.symbol}`,
            token1,
            token2,
            countdown: 5,
          });

          // Reset to default pair after 5 seconds
          const resetTimer = setTimeout(() => {
            setPoolWarning(null);
            // Only reset if this is still the active warning
            setSelectedPair((current) => {
              if (
                current.inputToken.address === token1.address &&
                current.outputToken.address === token2.address
              ) {
                return CHAIN_POOLS[chainId as keyof typeof CHAIN_POOLS][0];
              }
              return current;
            });
          }, 5000);

          return false;
        }

        const liquidity = await poolContract.read.liquidity();

        if (liquidity === BigInt(0)) {
          setPoolWarning({
            message: `Pool exists but has no liquidity for ${token1.symbol}/${token2.symbol}`,
            token1,
            token2,
            countdown: 5,
          });

          // Reset to default pair after 5 seconds
          const resetTimer = setTimeout(() => {
            setPoolWarning(null);
            // Only reset if this is still the active warning
            setSelectedPair((current) => {
              if (
                current.inputToken.address === token1.address &&
                current.outputToken.address === token2.address
              ) {
                return CHAIN_POOLS[chainId as keyof typeof CHAIN_POOLS][0];
              }
              return current;
            });
          }, 5000);

          return false;
        }

        return true;
      } catch (err) {
        console.error("Error checking pool availability:", err);
        setPoolWarning({
          message: `Error checking ${token1.symbol}/${token2.symbol} pool availability`,
          token1,
          token2,
          countdown: 5,
        });

        // Reset to default pair after 5 seconds
        const resetTimer = setTimeout(() => {
          setPoolWarning(null);
          // Only reset if this is still the active warning
          setSelectedPair((current) => {
            if (
              current.inputToken.address === token1.address &&
              current.outputToken.address === token2.address
            ) {
              return CHAIN_POOLS[chainId as keyof typeof CHAIN_POOLS][0];
            }
            return current;
          });
        }, 5000);

        return false;
      }
    },
    [chain?.id, findPool, publicClient, chainId]
  );

  // Update handleTokenSelect to use pool availability check
  const handleTokenSelect = useCallback(
    async (isInput: boolean, token: Token) => {
      // Clear any existing pool warnings
      setPoolWarning(null);

      setSelectedPair((prev) => {
        const otherToken = isInput ? prev.outputToken : prev.inputToken;

        // Clear amounts and errors
        setInputAmount("");
        setOutputAmount("");
        setSwapError(null);

        // Check pool availability asynchronously
        checkPoolAvailability(token, otherToken).then((isAvailable) => {
          if (!isAvailable) {
            return prev; // Keep existing pair if pool is not available
          }
        });

        const pool = findPool(token, otherToken);
        if (!pool) return prev;

        return {
          ...pool,
          inputToken: isInput ? token : otherToken,
          outputToken: isInput ? otherToken : token,
        };
      });
    },
    [findPool, checkPoolAvailability]
  );

  // Get user's ETH and USDC balances
  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, 15000); // Refresh every 15 seconds
    return () => clearInterval(interval);
  }, [address, chain?.id]);

  // Add effect to calculate output amount when input changes
  useEffect(() => {
    if (!inputAmount || !forward) return;

    try {
      const inputNum = parseFloat(inputAmount);
      const priceNum = parseFloat(forward);
      const outputNum = inputNum * priceNum;

      // Format the output amount with appropriate precision
      let formattedOutput: string;
      if (outputNum < 0.0001) {
        formattedOutput = outputNum.toExponential(6);
      } else if (outputNum < 1) {
        formattedOutput = outputNum.toFixed(8);
      } else {
        formattedOutput = outputNum.toFixed(4);
      }

      setOutputAmount(formattedOutput);
      setSwapError(null);
    } catch (err) {
      console.error("Error calculating output amount:", err);
      setOutputAmount("");
      setSwapError("Failed to calculate output amount");
    }
  }, [inputAmount, forward]);

  const {
    executeSwap,
    approve,
    checkApproval,
    approvalStatus,
    revokeApproval,
  } = useUniswapSwap();

  // Add this function to handle percentage clicks
  function handlePercentageClick(percentage: number) {
    const balance =
      tokenBalances[selectedPair.inputToken.address.toLowerCase()];
    if (!balance) return;

    const balanceNum = parseFloat(balance);
    const amount = (balanceNum * percentage) / 100;

    // Format the input amount appropriately
    let formattedAmount: string;
    if (selectedPair.inputToken.decimals <= 6) {
      // For stablecoins, show 2 decimals
      formattedAmount = amount.toFixed(2);
    } else {
      // For ETH and other tokens, show 4 decimals
      formattedAmount = amount.toFixed(4);
    }

    setInputAmount(formattedAmount);
  }

  // Add this near your other state declarations
  const [inputFocused, setInputFocused] = useState(false);
  const [outputFocused, setOutputFocused] = useState(false);

  // Enhance swap status type
  type SwapStage =
    | "idle"
    | "approving"
    | "swapping"
    | "confirming"
    | "success"
    | "pending"
    | "complete";

  const [swapStatus, setSwapStatus] = useState<SwapStatus>({
    stage: "idle",
    loading: false,
    error: null,
  });

  // Declare resetSwapForm first using function declaration
  const resetSwapForm = useCallback(() => {
    setInputAmount("");
    setOutputAmount("");
    setSwapError(null);
    // Preserve token selection
    setSelectedPair((prev) => ({
      ...prev,
      inputAmount: "",
      outputAmount: "",
    }));
  }, []);

  // Then use it in transactionController
  const transactionController = useMemo(() => {
    if (!publicClient) return null;

    return new TransactionController(publicClient, {
      onStatusChange: setSwapStatus,
      onSuccess: () => {
        setTimeout(resetSwapForm, 2000);
      },
      onError: (error) => {
        setSwapError(error);
      },
      showToast: window.seedConnector.showToast,
    });
  }, [publicClient, resetSwapForm]);

  // Handle transaction monitoring
  useEffect(() => {
    if (
      !transactionController ||
      !swapStatus.hash ||
      swapStatus.stage !== "pending"
    ) {
      return;
    }

    transactionController.monitorTransaction(swapStatus.hash);
  }, [transactionController, swapStatus.hash, swapStatus.stage]);

  // Add a new handler for approve button
  const handleApprove = async () => {
    try {
      setSwapStatus({
        stage: "approving",
        loading: true,
        error: null,
      });

      let retries = 0;
      const maxRetries = 2;

      while (retries < maxRetries) {
        try {
          const approved = await approve(selectedPair, inputAmount);
          if (approved) {
            setSwapStatus({
              stage: "idle",
              loading: false,
              error: null,
            });

            // Add success notification here
            window.seedConnector.showToast({
              type: "success",
              message: "Token approval successful",
            });

            return;
          }
        } catch (error) {
          if (retries === maxRetries - 1) throw error;
          console.warn(`Approval failed, retry ${retries + 1}`);
        }
        retries++;
      }
    } catch (error: any) {
      setSwapStatus({
        stage: "error",
        loading: false,
        error: error.message || "Approval failed after retries",
      });

      // Add error notification
      window.seedConnector.showToast({
        type: "error",
        message: error.message || "Approval failed",
      });
    }
  };

  // Handle swap
  const handleSwap = async () => {
    try {
      if (!inputAmount || !outputAmount || !transactionController) return;

      setSwapStatus({ stage: "swapping", loading: true, error: null });
      const result = await executeSwap(selectedPair, inputAmount);

      if (result.status === "success") {
        // Reset form first
        resetSwapForm();

        // Show success state temporarily
        setSwapStatus({
          stage: "success",
          loading: false,
          error: null,
          hash: result.hash,
        });

        // Show notification
        window.seedConnector.showToast({
          type: "success",
          message: "Swap executed successfully",
        });

        // Reset to idle after 2 seconds
        setTimeout(() => {
          setSwapStatus({
            stage: "idle",
            loading: false,
            error: null,
          });
        }, 2000);
      } else {
        setSwapStatus({
          stage: "error",
          loading: false,
          error: result.error || "Swap failed",
        });
      }
    } catch (error) {
      console.error("Swap execution error:", error);
      setSwapStatus({
        stage: "error",
        loading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Add effect to check approval when input token changes
  useEffect(() => {
    if (selectedPair?.inputToken) {
      checkApproval(selectedPair);
    }
  }, [selectedPair?.inputToken, checkApproval]);

  // Keep the existing effect for input amount changes
  useEffect(() => {
    if (inputAmount && selectedPair) {
      checkApproval(selectedPair, inputAmount);
    }
  }, [inputAmount, selectedPair, checkApproval]);

  // Update fetchBalances to use viem/wagmi
  async function fetchBalances() {
    if (!address || !chain?.id || !publicClient) return;

    try {
      // Get all unique tokens from the available pairs
      const uniqueTokens = Array.from(
        new Set(
          CHAIN_POOLS[chain.id as keyof typeof CHAIN_POOLS].flatMap((pair) => [
            pair.inputToken,
            pair.outputToken,
          ])
        )
      );

      const ethToken = CHAIN_TOKENS[chain.id as keyof typeof CHAIN_TOKENS].ETH;
      if (!uniqueTokens.find((token) => token.isNative)) {
        uniqueTokens.push(ethToken);
      }

      const balancePromises = uniqueTokens.map(async (token) => {
        try {
          let balance;
          if (token.isNative) {
            balance = await publicClient.getBalance({
              address: address as Address,
            });
          } else {
            const tokenContract = getContract({
              address: token.address as Address,
              abi: erc20Abi,
              client: publicClient,
            });

            balance = await tokenContract.read.balanceOf([address as Address]);
          }

          return {
            address: token.address.toLowerCase(),
            balance: formatUnits(balance, token.decimals),
          };
        } catch (err) {
          console.error(`Error fetching balance for ${token.symbol}:`, err);
          return { address: token.address.toLowerCase(), balance: null };
        }
      });

      const balances = await Promise.all(balancePromises);
      const balanceMap = balances.reduce((acc, { address, balance }) => {
        acc[address.toLowerCase()] = balance;
        return acc;
      }, {} as { [address: string]: string | null });

      setTokenBalances(balanceMap);
    } catch (err) {
      console.error("Error fetching balances:", err);
      setTokenBalances({});
    }
  }

  // Add this function to swap tokens
  const handleSwapTokens = () => {
    setSelectedPair((prev) => ({
      ...prev,
      inputToken: prev.outputToken,
      outputToken: prev.inputToken,
    }));
    // Clear input/output amounts when swapping
    setInputAmount("");
    setOutputAmount("");
    setSwapError(null);
  };

  function formatBalance(balance: string, token: Token): string {
    if (balance === "...") return balance;

    const num = parseFloat(balance);

    // Handle zero balance
    if (num === 0) return "0";

    // Handle stablecoins (USDC, USDT, etc.)
    if (token.decimals <= 6) {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }

    // Handle ETH and other tokens
    if (num < 0.0001) {
      return "<0.0001";
    } else if (num < 1) {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      });
    } else if (num < 1000) {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    } else {
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  }

  function getTokenBalance(token: Token): string {
    const balance = tokenBalances[token.address.toLowerCase()];
    return formatBalance(balance ?? "...", token);
  }

  const handleRevokeApproval = async () => {
    try {
      const revoked = await revokeApproval(selectedPair);
      if (revoked) {
        window.seedConnector.showToast({
          type: "success",
          message: "Approval revoked successfully",
        });

        await checkApproval(selectedPair);
      }
    } catch (error: any) {
      window.seedConnector.showToast({
        type: "error",
        message: error.message || "Failed to revoke approval",
      });
    }
  };

  const ethBalance = useMemo(() => {
    const ethToken = CHAIN_TOKENS[chainId as keyof typeof CHAIN_TOKENS].ETH;
    const rawBalance = tokenBalances[ethToken.address.toLowerCase()];

    return rawBalance || "0";
  }, [tokenBalances, chainId]);

  const [showRevokeModal, setShowRevokeModal] = useState(false);

  // Add form submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent form from submitting and reloading
  };

  // Add effect for countdown timer
  useEffect(() => {
    if (!poolWarning) return;

    const countdownInterval = setInterval(() => {
      setPoolWarning((current) => {
        if (!current) return null;

        const newCountdown = current.countdown - 1;
        if (newCountdown <= 0) {
          clearInterval(countdownInterval);
          return current; // Will be cleared by the timeout in checkPoolAvailability
        }

        return {
          ...current,
          countdown: newCountdown,
        };
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, [poolWarning]);

  return (
    <div className="tw-min-h-screen tw-flex tw-flex-col tw-p-0 tw-bg-[#111111] tw-relative tw-z-0">
      <Row className="w-100 justify-content-center align-items-center">
        <Col xs={12} sm={10} md={8} lg={6} xl={5}>
          <div className="tw-bg-[#1a1a1a]/80 tw-backdrop-blur-xl tw-rounded-3xl tw-p-7 tw-w-full tw-max-w-[480px] tw-border tw-border-white/5 tw-shadow-lg tw-mx-auto tw-mt-24 tw-relative tw-isolate tw-z-1">
            <div className="tw-mb-6">
              <PriceDisplay
                pair={displayPair}
                forward={forward}
                reverse={reverse}
                loading={priceLoading}
                error={priceError}
              />
            </div>

            {/* Pool Availability Warning */}
            {poolWarning && (
              <div className="tw-bg-[#ffb019]/10 tw-border tw-border-[#ffb019]/20 tw-rounded-xl tw-p-4 tw-mb-6 tw-flex tw-gap-4 tw-items-start tw-relative tw-z-1 tw-animate-pulse">
                <div className="tw-text-xl tw-leading-none">⚠️</div>
                <div className="tw-flex-1">
                  <div className="tw-text-[#ffb019] tw-font-semibold tw-mb-1 tw-flex tw-items-center tw-gap-2">
                    <span>Liquidity Pool Unavailable</span>
                    <div className="tw-ml-auto tw-text-sm tw-bg-[#ffb019]/20 tw-px-2 tw-py-0.5 tw-rounded-full">
                      Resetting in {poolWarning.countdown}s
                    </div>
                  </div>
                  <div className="tw-text-white/70 tw-text-sm tw-leading-relaxed">
                    {poolWarning.message}
                  </div>
                  <div className="tw-flex tw-items-center tw-gap-2 tw-mt-2">
                    <button
                      onClick={() => {
                        setPoolWarning(null);
                        setSelectedPair(
                          CHAIN_POOLS[chainId as keyof typeof CHAIN_POOLS][0]
                        );
                      }}
                      className="tw-text-[#ffb019] tw-text-sm tw-font-medium tw-bg-[#ffb019]/20 tw-px-3 tw-py-1 tw-rounded-lg hover:tw-bg-[#ffb019]/30 tw-transition-colors"
                    >
                      Reset Now
                    </button>
                    <button
                      onClick={() => setPoolWarning(null)}
                      className="tw-text-white/60 tw-text-sm tw-font-medium tw-bg-white/5 tw-px-3 tw-py-1 tw-rounded-lg hover:tw-bg-white/10 tw-transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!address ? (
              <div className="tw-text-center tw-py-8 tw-px-4 tw-bg-white/[0.02] tw-rounded-2xl tw-border tw-border-white/5">
                <p className="tw-text-white/70 tw-m-0 tw-text-base">
                  Please connect your wallet to swap tokens
                </p>
              </div>
            ) : (
              <Form onSubmit={handleSubmit}>
                <div className="tw-mb-8 tw-mt-8 tw-relative tw-z-1">
                  <div className="tw-flex tw-justify-between tw-items-center tw-mb-3">
                    <span className="tw-text-white tw-text-base">You Pay</span>
                    <span className="tw-text-white/60 tw-text-base">
                      Balance: {getTokenBalance(selectedPair.inputToken)}{" "}
                      {selectedPair.inputToken.symbol}
                    </span>
                  </div>
                  <div
                    className={`tw-relative tw-flex tw-items-center tw-bg-black/20 tw-border tw-border-white/10 tw-rounded-2xl tw-transition-colors tw-duration-200 tw-z-[1]`}
                  >
                    <Form.Control
                      type="number"
                      value={inputAmount}
                      onChange={(e) => {
                        setInputAmount(e.target.value);
                        setOutputAmount("");
                        setSwapError(null);
                      }}
                      onFocus={() => setInputFocused(true)}
                      onBlur={() => setInputFocused(false)}
                      placeholder="0.0"
                      min="0"
                      step="any"
                      className="tw-bg-transparent tw-border-none tw-text-white/90 tw-text-2xl tw-font-medium tw-py-5 tw-px-6 tw-pr-30 tw-w-full tw-font-mono focus:tw-outline-none focus:tw-ring-0 hover:tw-bg-transparent focus:tw-bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:tw-appearance-none [&::-webkit-inner-spin-button]:tw-appearance-none focus:tw-text-white/90"
                    />
                    <div className="tw-absolute tw-right-2 tw-top-1/2 tw-transform tw--translate-y-1/2">
                      <TokenSelect
                        tokens={availableTokens}
                        selectedToken={selectedPair.inputToken}
                        onSelect={(token) => handleTokenSelect(true, token)}
                        disabled={swapLoading}
                      />
                    </div>
                  </div>
                  {/* Show approval section for non-native tokens, otherwise show a spacer */}
                  {!selectedPair.inputToken.isNative ? (
                    <div className="tw-flex tw-items-center tw-justify-between tw-h-[28px] tw-mt-3 tw-mb-3">
                      <div className="tw-flex tw-items-center tw-gap-2">
                        <span className="tw-text-white/70 tw-text-sm">
                          Approved: {formatAllowance(approvalStatus.allowance)}{" "}
                          {selectedPair.inputToken.symbol}
                        </span>
                        <button
                          className="tw-bg-white/[0.08] tw-border tw-border-white/10 tw-rounded-xl tw-w-7 tw-h-7 tw-flex tw-items-center tw-justify-center tw-text-white/70 hover:tw-bg-white/[0.12] hover:tw-text-white tw-transition-all tw-duration-200"
                          onClick={() => setShowRevokeModal(true)}
                        >
                          <Settings size={16} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="tw-h-[28px] tw-mt-3 tw-mb-3"></div>
                  )}
                  <div className="tw-flex tw-gap-1.5 tw-mt-3 tw-px-1">
                    {[25, 50, 75, 100].map((percent) => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => handlePercentageClick(percent)}
                        className="tw-flex-1 tw-bg-white/5 tw-border tw-border-white/10 tw-rounded-xl tw-text-white/90 tw-py-1.5 tw-px-1 tw-text-sm tw-font-medium tw-cursor-pointer tw-transition-all tw-duration-150 hover:tw-bg-white/10 hover:tw-border-white/20 hover:tw-transform hover:tw--translate-y-px active:tw-transform active:tw-translate-y-0 disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                        disabled={swapLoading}
                      >
                        {percent === 100 ? "MAX" : `${percent}%`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Swap direction button */}
                <div className="tw-flex tw-justify-center tw-my-[-12px] tw-relative tw-z-[2]">
                  <button
                    type="button"
                    onClick={handleSwapTokens}
                    className="tw-bg-white/[0.08] tw-border tw-border-white/10 tw-rounded-xl tw-w-10 tw-h-10 tw-flex tw-items-center tw-justify-center tw-cursor-pointer tw-transition-all tw-duration-200 tw-text-white/80 tw-p-0 tw-relative tw-shadow-md hover:tw-bg-white/[0.12] hover:tw-text-white hover:tw-shadow-lg hover:tw-transform hover:tw-scale-105 active:tw-transform active:tw-translate-y-px disabled:tw-opacity-50 disabled:tw-cursor-not-allowed"
                    disabled={swapLoading}
                    title="Swap tokens"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M4 2.5L4 10.5M4 10.5L6.5 8M4 10.5L1.5 8"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 13.5L12 5.5M12 5.5L9.5 8M12 5.5L14.5 8"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className="tw-mb-8 tw-mt-8 tw-relative tw-z-1">
                  <div className="tw-flex tw-justify-between tw-items-center tw-mb-3">
                    <span className="tw-text-white tw-text-base">
                      You Receive
                    </span>
                    <span className="tw-text-white/60 tw-text-base">
                      Balance: {getTokenBalance(selectedPair.outputToken)}{" "}
                      {selectedPair.outputToken.symbol}
                    </span>
                  </div>
                  <div
                    className={`tw-relative tw-flex tw-items-center tw-bg-black/20 tw-border tw-border-white/10 tw-rounded-2xl tw-transition-colors tw-duration-200 tw-z-[1] ${
                      outputFocused ? "tw-border-white/15" : ""
                    }`}
                  >
                    <Form.Control
                      type="text"
                      value={outputAmount}
                      readOnly
                      onFocus={() => setOutputFocused(true)}
                      onBlur={() => setOutputFocused(false)}
                      placeholder="0.0"
                      className="tw-bg-transparent tw-border-none tw-text-white/90 tw-text-2xl tw-font-medium tw-py-5 tw-px-6 tw-pr-30 tw-w-full tw-font-mono focus:tw-outline-none focus:tw-ring-0 hover:tw-bg-transparent focus:tw-bg-transparent focus:tw-text-white/90"
                    />
                    <div className="tw-absolute tw-right-2 tw-top-1/2 tw-transform tw--translate-y-1/2">
                      <TokenSelect
                        tokens={availableTokens}
                        selectedToken={selectedPair.outputToken}
                        onSelect={(token) => handleTokenSelect(false, token)}
                        disabled={swapLoading}
                      />
                    </div>
                  </div>
                </div>

                {address &&
                  tokenBalances[
                    CHAIN_TOKENS[
                      chainId as keyof typeof CHAIN_TOKENS
                    ].ETH.address.toLowerCase()
                  ] !== undefined && <GasWarning ethBalance={ethBalance} />}

                <SwapButton
                  disabled={
                    !outputAmount ||
                    swapStatus.loading ||
                    !inputAmount ||
                    !address ||
                    swapStatus.stage === "complete" ||
                    // Check if user has enough balance of the input token
                    Boolean(
                      inputAmount &&
                        tokenBalances[
                          selectedPair.inputToken.address.toLowerCase()
                        ] &&
                        parseFloat(inputAmount) >
                          parseFloat(
                            tokenBalances[
                              selectedPair.inputToken.address.toLowerCase()
                            ] || "0"
                          )
                    )
                  }
                  status={swapStatus}
                  approvalStatus={approvalStatus}
                  onApprove={handleApprove}
                  onSwap={handleSwap}
                  inputAmount={inputAmount}
                  outputAmount={outputAmount}
                  ethBalance={ethBalance}
                  hasEnoughTokenBalance={Boolean(
                    inputAmount &&
                      tokenBalances[
                        selectedPair.inputToken.address.toLowerCase()
                      ] &&
                      parseFloat(inputAmount) <=
                        parseFloat(
                          tokenBalances[
                            selectedPair.inputToken.address.toLowerCase()
                          ] || "0"
                        )
                  )}
                  onRevoke={handleRevokeApproval}
                  onClear={() => {
                    setSwapStatus({
                      stage: "idle",
                      loading: false,
                      error: null,
                    });
                    resetSwapForm();
                  }}
                  selectedPair={selectedPair}
                />

                {swapError && (
                  <div
                    className="tw-bg-red-500/10 tw-border tw-border-red-500/20 tw-rounded-xl tw-p-3 tw-mb-3 tw-text-red-400"
                    role="alert"
                  >
                    {swapError}
                  </div>
                )}
              </Form>
            )}
          </div>
        </Col>
      </Row>

      <RevokeModal
        show={showRevokeModal}
        onHide={() => setShowRevokeModal(false)}
        onRevoke={handleRevokeApproval}
        pair={selectedPair}
        loading={false}
      />
    </div>
  );
}
