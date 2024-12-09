import { useState, useEffect, useMemo, useCallback } from "react";
import { Container, Row, Col, Form, Button } from "react-bootstrap";
import { useAccount } from "wagmi";
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
} from "./constants";
import { ERC20_ABI, UNISWAP_V3_POOL_ABI } from "./abis";
import { usePoolPrice } from "./hooks/usePoolPrice";
import PriceDisplay from "./components/PriceDisplay";
import { SwatchBook } from "lucide-react";
import TokenSelect from "./components/TokenSelect";
import { Token, TokenPair, toSDKToken } from "./types";

const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
];

// Add loading indicator component
function LoadingSpinner() {
  return <div className={styles.loadingSpinner} />;
}

export default function UniswapApp() {
  const { address, chain } = useAccount();
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

  // Handle token selection
  const handleTokenSelect = useCallback(
    (isInput: boolean, token: Token) => {
      setSelectedPair((prev) => {
        const otherToken = isInput ? prev.outputToken : prev.inputToken;
        const pool = findPool(token, otherToken);

        if (!pool) return prev; // Keep existing pair if no pool exists

        // Determine correct order based on pool configuration
        const newPair = {
          ...pool,
          inputToken: isInput ? token : otherToken,
          outputToken: isInput ? otherToken : token,
        };

        // Clear amounts when changing tokens
        setInputAmount("");
        setOutputAmount("");
        setSwapError(null);

        return newPair;
      });
    },
    [findPool]
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

  // Execute swap
  async function executeSwap() {
    if (!address || !outputAmount || !chain) return;

    setSwapLoading(true);
    setSwapError(null);

    try {
      // Get provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      // Verify the quote on-chain before executing the swap
      const quoterContract = new ethers.Contract(
        CHAIN_QUOTER_ADDRESSES[
          chain.id as keyof typeof CHAIN_QUOTER_ADDRESSES
        ] || CHAIN_QUOTER_ADDRESSES[1],
        QUOTER_ABI,
        provider
      );

      // Calculate amounts and get pool
      const amountIn = parseUnits(
        inputAmount,
        selectedPair.inputToken.decimals
      );

      // Get final quote before swap
      const quoteAmount = await quoterContract.callStatic.quoteExactInputSingle(
        selectedPair.inputToken.address,
        selectedPair.outputToken.address,
        selectedPair.fee,
        amountIn,
        0
      );

      // Convert tokens to SDK format
      const tokenIn = toSDKToken(selectedPair.inputToken, chain.id);
      const tokenOut = toSDKToken(selectedPair.outputToken, chain.id);

      // Get pool instance
      const pool = await getPool(
        selectedPair.inputToken,
        selectedPair.outputToken,
        selectedPair.fee,
        provider
      );

      // Create trade
      const typedValueParsed = CurrencyAmount.fromRawAmount(
        tokenIn,
        amountIn.toString()
      );

      const route = new Route([pool], tokenIn, tokenOut);
      const trade = await Trade.fromRoute(
        route,
        typedValueParsed,
        TradeType.EXACT_INPUT
      );

      // Prepare swap parameters
      const slippageTolerance = new Percent("50", "10000"); // 0.5%
      const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

      const swapParams = SwapRouter.swapCallParameters(trade, {
        slippageTolerance,
        recipient: address,
        deadline,
      });

      // Execute the swap
      const tx = await signer.sendTransaction({
        data: swapParams.calldata,
        to:
          CHAIN_ROUTER_ADDRESSES[
            chain.id as keyof typeof CHAIN_ROUTER_ADDRESSES
          ] || CHAIN_ROUTER_ADDRESSES[1],
        value: swapParams.value,
        from: address,
      });

      await tx.wait();
      fetchBalances();
    } catch (err) {
      console.error("Error executing swap:", err);
      setSwapError(
        `Failed to execute swap on ${chain.name}. Please try again.`
      );
    } finally {
      setSwapLoading(false);
    }
  }

  // Move this function outside useEffect
  async function fetchBalances() {
    if (!address || !chain?.id) return;

    try {
      const provider = new ethers.providers.JsonRpcProvider(
        RPC_URLS[chain.id as keyof typeof RPC_URLS] || RPC_URLS[1]
      );

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

  return (
    <Container fluid className={styles.uniswapContainer}>
      <div className={styles.header}>
        <h2>Swap</h2>
        {chain?.name && (
          <span className={styles.networkBadge}>{chain.name}</span>
        )}
      </div>

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

                {/* Add swap direction button */}
                <div className={styles.swapDirectionButton}>
                  <button
                    type="button"
                    onClick={handleSwapTokens}
                    className={styles.directionButton}
                  >
                    <SwatchBook />
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

                <Button
                  variant="success"
                  onClick={executeSwap}
                  disabled={!outputAmount || swapLoading || !inputAmount}
                  className={styles.actionButton}
                >
                  {swapLoading ? (
                    <LoadingSpinner />
                  ) : swapError ? (
                    "Try Again"
                  ) : !inputAmount || !outputAmount ? (
                    "Enter an amount"
                  ) : (
                    "Swap"
                  )}
                </Button>

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
