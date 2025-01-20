import { useState, useEffect, useMemo, useCallback } from "react";
import { Container, Row, Col, Form, Button } from "react-bootstrap";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ethers } from "ethersv5";
import styles from "./UniswapApp.module.scss";
import { CurrencyAmount, TradeType, Percent } from "@uniswap/sdk-core";
import {
  Pool,
  Position,
  nearestUsableTick,
  TickMath,
  Trade,
  Route,
  SwapQuoter,
  SwapRouter,
} from "@uniswap/v3-sdk";
import { parseUnits } from "ethersv5/lib/utils";
import {
  CHAIN_POOLS,
  CHAIN_TOKENS,
  RPC_URLS,
  CHAIN_QUOTER_ADDRESSES,
  CHAIN_ROUTER_ADDRESSES,
  SupportedChainId,
  FALLBACK_RPC_URLS,
} from "./constants";
import { ERC20_ABI, UNISWAP_V3_POOL_ABI } from "./abis";
import { usePoolPrice } from "./hooks/usePoolPrice";
import PriceDisplay from "./components/PriceDisplay";
import { SwatchBook } from "lucide-react";
import TokenSelect from "./components/TokenSelect";
import { Token, TokenPair, toSDKToken, SwapStatus } from "./types";
import { useUniswapSwap } from "./hooks/useUniswapSwap";
import { SwapButton } from "./components/SwapButton";
import { useEthersProvider } from "./hooks/useEthersProvider";
import {
  TransactionController,
  TransactionStatus,
} from "./controllers/TransactionController";

const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
];

// Add loading indicator component
function LoadingSpinner() {
  return <div className={styles.loadingSpinner} />;
}

// Add these helper functions before the UniswapApp component

async function checkApprovalNeeded(
  token: Token,
  amount: string,
  chainId: number,
  address: string,
  publicClient: any
): Promise<boolean> {
  if (token.symbol === "ETH") return false;

  const provider = new ethers.providers.Web3Provider(publicClient.transport);
  const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
  const routerAddress = CHAIN_ROUTER_ADDRESSES[chainId as SupportedChainId];

  const allowance = await tokenContract.allowance(address, routerAddress);
  const inputAmountWei = parseUnits(amount, token.decimals);

  return allowance.lt(inputAmountWei);
}

async function handleTokenApproval(
  token: Token,
  amount: string,
  chainId: number,
  publicClient: any
): Promise<void> {
  const provider = new ethers.providers.Web3Provider(publicClient.transport);
  const signer = provider.getSigner();
  const tokenContract = new ethers.Contract(token.address, ERC20_ABI, signer);
  const routerAddress = CHAIN_ROUTER_ADDRESSES[chainId as SupportedChainId];

  const tx = await tokenContract.approve(
    routerAddress,
    ethers.constants.MaxUint256
  );
  await tx.wait();
}

function formatAllowance(allowance: string | undefined): string {
  if (!allowance) return "0";
  const num = parseFloat(allowance);
  if (num > 1_000_000) return "∞";
  return num.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

export default function UniswapApp() {
  const { address, chain } = useAccount();
  const provider = useEthersProvider();
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

  // Add this function to check pool availability
  const checkPoolAvailability = useCallback(
    async (token1: Token, token2: Token) => {
      if (!chain?.id) return false;

      const pool = findPool(token1, token2);
      if (!pool) {
        setSwapError(
          `No liquidity pool available for ${token1.symbol}/${token2.symbol}`
        );
        return false;
      }

      try {
        const provider = new ethers.providers.JsonRpcProvider(
          RPC_URLS[chain.id as SupportedChainId]
        );

        const poolContract = new ethers.Contract(
          pool.poolAddress,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        const [code, liquidity] = await Promise.all([
          provider.getCode(pool.poolAddress),
          poolContract.liquidity(),
        ]);

        if (code === "0x") {
          setSwapError(
            `No liquidity pool contract found for ${token1.symbol}/${token2.symbol}`
          );
          return false;
        }

        if (liquidity.eq(0)) {
          setSwapError(
            `Pool exists but has no liquidity for ${token1.symbol}/${token2.symbol}`
          );
          return false;
        }

        return true;
      } catch (err) {
        console.error("Error checking pool availability:", err);
        setSwapError(
          `Error checking ${token1.symbol}/${token2.symbol} pool availability`
        );
        return false;
      }
    },
    [chain?.id, findPool]
  );

  // Update handleTokenSelect to use pool availability check
  const handleTokenSelect = useCallback(
    async (isInput: boolean, token: Token) => {
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

  async function getPool(
    tokenA: Token,
    tokenB: Token,
    fee: number,
    provider: ethers.providers.Provider
  ) {
    const poolContract = new ethers.Contract(
      selectedPair.poolAddress,
      UNISWAP_V3_POOL_ABI,
      provider
    );

    const slot0 = await poolContract.slot0();

    // Convert to SDK tokens
    const sdkTokenA = toSDKToken(tokenA, chain?.id || 1);
    const sdkTokenB = toSDKToken(tokenB, chain?.id || 1);

    return new Pool(
      sdkTokenA,
      sdkTokenB,
      fee,
      slot0.sqrtPriceX96.toString(),
      "0", // Use minimal liquidity since we only need price
      slot0.tick,
      [] // Pass empty array instead of tick provider
    );
  }

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

  const [swapStatus, setSwapStatus] = useState<TransactionStatus>({
    stage: "idle",
    loading: false,
    error: null,
  });

  // Declare resetSwapForm first using function declaration
  function resetSwapForm() {
    setInputAmount("");
    setOutputAmount("");
    setSwapStatus({
      stage: "idle",
      loading: false,
      error: null,
    });
    fetchBalances();
  }

  // Then use it in transactionController
  const transactionController = useMemo(() => {
    if (!provider) return null;

    return new TransactionController(provider, {
      onStatusChange: setSwapStatus,
      onSuccess: () => {
        setTimeout(resetSwapForm, 2000);
      },
      onError: (error) => {
        setSwapError(error);
      },
      showToast: window.seedConnector.showToast,
    });
  }, [provider, resetSwapForm]);

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

      const approved = await approve(selectedPair, inputAmount);
      if (!approved) {
        throw new Error("Failed to approve token");
      }

      // Update status after successful approval
      setSwapStatus({
        stage: "idle",
        loading: false,
        error: null,
      });

      // Show success toast
      window.seedConnector.showToast({
        type: "success",
        message: "Token approved successfully",
      });
    } catch (error: any) {
      setSwapStatus({
        stage: "idle",
        loading: false,
        error: error.message || "Failed to approve token",
      });

      window.seedConnector.showToast({
        type: "error",
        message: error.message || "Failed to approve token",
      });
    }
  };

  // Handle swap
  const handleSwap = async () => {
    if (!inputAmount || !outputAmount || !transactionController) return;

    try {
      setSwapStatus({
        stage: "swapping",
        loading: true,
        error: null,
      });

      const result = await executeSwap(selectedPair, inputAmount);

      if (result.status === "success") {
        setSwapStatus({
          stage: "pending",
          loading: true,
          error: null,
          hash: result.hash,
        });
      } else {
        throw new Error(result.error || "Swap failed");
      }
    } catch (error: any) {
      setSwapStatus({
        stage: "idle",
        loading: false,
        error: error.message || "Failed to execute swap",
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

  // Move this function outside useEffect
  async function fetchBalances() {
    if (!address || !chain?.id) return;

    try {
      // Use primary RPC with fallback
      let provider;
      try {
        provider = new ethers.providers.JsonRpcProvider(
          RPC_URLS[chain.id as SupportedChainId]
        );
      } catch (error) {
        console.warn("Primary RPC failed, using fallback:", error);
        provider = new ethers.providers.JsonRpcProvider(
          FALLBACK_RPC_URLS[chain.id as SupportedChainId]
        );
      }

      // Get all unique tokens from the available pairs
      const uniqueTokens = Array.from(
        new Set(
          CHAIN_POOLS[chain.id as keyof typeof CHAIN_POOLS].flatMap((pair) => [
            pair.inputToken,
            pair.outputToken,
          ])
        )
      );

      const balancePromises = uniqueTokens.map(async (token) => {
        try {
          const balance =
            token.symbol === "ETH"
              ? await provider.getBalance(address)
              : await new ethers.Contract(
                  token.address,
                  ERC20_ABI,
                  provider
                ).balanceOf(address);

          return {
            address: token.address,
            balance: ethers.utils.formatUnits(balance, token.decimals),
          };
        } catch (err) {
          console.error(`Error fetching balance for ${token.symbol}:`, err);
          return { address: token.address, balance: null };
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
      }
    } catch (error: any) {
      window.seedConnector.showToast({
        type: "error",
        message: error.message || "Failed to revoke approval",
      });
    }
  };

  return (
    <Container fluid className={styles.uniswapContainer}>
      <Row className="w-100 justify-content-center align-items-center">
        <Col xs={12} sm={10} md={8} lg={6} xl={5}>
          <div className={styles.swapCard}>
            <div className={styles.priceHeader}>
              <PriceDisplay
                pair={displayPair}
                forward={forward}
                reverse={reverse}
                loading={priceLoading}
                error={priceError}
              />
            </div>

            {!address ? (
              <div className={styles.connectPrompt}>
                <p>Please connect your wallet to swap tokens</p>
              </div>
            ) : (
              <Form>
                <div className={styles.inputGroup}>
                  <div className={styles.inputLabel}>
                    <span>You Pay</span>
                    <span className={styles.balance}>
                      Balance: {getTokenBalance(selectedPair.inputToken)}{" "}
                      {selectedPair.inputToken.symbol}
                    </span>
                  </div>
                  <div
                    className={`${styles.inputWrapper} ${
                      inputFocused ? styles.focused : ""
                    }`}
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
                      className={styles.tokenInput}
                    />
                    <TokenSelect
                      tokens={availableTokens}
                      selectedToken={selectedPair.inputToken}
                      onSelect={(token) => handleTokenSelect(true, token)}
                      disabled={swapLoading}
                    />
                  </div>
                  {selectedPair.inputToken.symbol !== "ETH" && (
                    <div className={styles.allowanceContainer}>
                      <div className={styles.allowanceInfo}>
                        Approved: {formatAllowance(approvalStatus.allowance)}{" "}
                        {selectedPair.inputToken.symbol}
                      </div>
                      {approvalStatus.allowance &&
                        parseFloat(approvalStatus.allowance) > 0 && (
                          <button
                            onClick={handleRevokeApproval}
                            className={styles.revokeButton}
                            disabled={approvalStatus.loading}
                          >
                            Revoke
                          </button>
                        )}
                    </div>
                  )}
                  <div className={styles.percentageButtons}>
                    {[25, 50, 75, 100].map((percent) => (
                      <button
                        key={percent}
                        type="button"
                        onClick={() => handlePercentageClick(percent)}
                        className={styles.percentButton}
                        disabled={swapLoading}
                      >
                        {percent === 100 ? "MAX" : `${percent}%`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Swap direction button */}
                <div className={styles.swapDirectionButton}>
                  <button
                    type="button"
                    onClick={handleSwapTokens}
                    className={styles.directionButton}
                    disabled={swapLoading}
                    title="Swap tokens"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M4 2.5L4 10.5M4 10.5L6.5 8M4 10.5L1.5 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 13.5L12 5.5M12 5.5L9.5 8M12 5.5L14.5 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.inputLabel}>
                    <span>You Receive</span>
                    <span className={styles.balance}>
                      Balance: {getTokenBalance(selectedPair.outputToken)}{" "}
                      {selectedPair.outputToken.symbol}
                    </span>
                  </div>
                  <div className={styles.inputWrapper}>
                    <Form.Control
                      type="text"
                      value={outputAmount}
                      readOnly
                      placeholder="0.0"
                      className={styles.tokenInput}
                    />
                    <TokenSelect
                      tokens={availableTokens}
                      selectedToken={selectedPair.outputToken}
                      onSelect={(token) => handleTokenSelect(false, token)}
                      disabled={swapLoading}
                    />
                  </div>
                </div>

                <SwapButton
                  disabled={
                    !outputAmount ||
                    swapStatus.loading ||
                    !inputAmount ||
                    !address ||
                    swapStatus.stage === "complete"
                  }
                  status={swapStatus}
                  approvalStatus={approvalStatus}
                  onApprove={handleApprove}
                  onSwap={handleSwap}
                  inputAmount={inputAmount}
                  outputAmount={outputAmount}
                />

                {swapError && (
                  <div className="alert alert-danger mb-3 py-2" role="alert">
                    {swapError}
                  </div>
                )}
              </Form>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}
