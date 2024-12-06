import { useState, useEffect, useMemo } from "react";
import { Container, Row, Col, Form, Button } from "react-bootstrap";
import { useAccount } from "wagmi";
import { ethers } from "ethersv5";
import styles from "./UniswapApp.module.scss";
import { Token, CurrencyAmount, TradeType, Percent } from "@uniswap/sdk-core";
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
import { TOKENS, TOKEN_PAIRS, TICK_LENS_ADDRESS } from "./constants";
import { ERC20_ABI, UNISWAP_V3_POOL_ABI } from "./abis";
import { usePoolPrice } from "./hooks/usePoolPrice";
import PriceDisplay from "./components/PriceDisplay";
import { SwatchBook } from "lucide-react";

const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const QUOTER_CONTRACT_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";

// Add this interface
interface Tick {
  liquidityGross: bigint;
  liquidityNet: bigint;
  tickIdx: number;
}

// Add this class
class TickDataProvider {
  private ticks: Tick[] = [];

  constructor(private readonly provider: ethers.providers.Provider) {}

  async getTick(tick: number): Promise<Tick> {
    if (this.ticks[tick]) {
      return this.ticks[tick];
    }
    return {
      liquidityGross: BigInt(0),
      liquidityNet: BigInt(0),
      tickIdx: tick,
    };
  }

  async nextInitializedTickWithinOneWord(
    tick: number,
    lte: boolean,
    tickSpacing: number
  ): Promise<[number, boolean]> {
    // For simplicity, return the next tick based on tickSpacing
    const nextTick = Math.ceil(tick / tickSpacing) * tickSpacing;
    return [nextTick, false];
  }
}

// Add this ABI
const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
];

export default function UniswapApp() {
  const { address } = useAccount();
  const [selectedPair, setSelectedPair] = useState(TOKEN_PAIRS[0]);

  // Create a fixed display pair that doesn't change with swapping
  const displayPair = useMemo(() => TOKEN_PAIRS[0], []); // Always ETH/USDC for display
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
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);

  // Get user's ETH and USDC balances
  useEffect(() => {
    fetchBalances();
  }, [address]);

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

    return new Pool(
      tokenA,
      tokenB,
      fee,
      slot0.sqrtPriceX96.toString(),
      "0", // Use minimal liquidity since we only need price
      slot0.tick,
      [] // Pass empty array instead of tick provider
    );
  }

  async function getQuote() {
    if (!inputAmount || !address || !forward) return;

    setSwapLoading(true);
    setSwapError(null);

    try {
      const provider = new ethers.providers.JsonRpcProvider(
        "https://eth-mainnet.public.blastapi.io"
      );

      const quoterContract = new ethers.Contract(
        QUOTER_CONTRACT_ADDRESS,
        QUOTER_ABI,
        provider
      );

      const inputAmountWei = parseUnits(
        inputAmount,
        selectedPair.inputToken.decimals
      );

      const quote = await quoterContract.callStatic.quoteExactInputSingle(
        selectedPair.inputToken.address,
        selectedPair.outputToken.address,
        selectedPair.fee,
        inputAmountWei,
        0
      );

      const outputAmountFormatted = ethers.utils.formatUnits(
        quote,
        selectedPair.outputToken.decimals
      );

      // Format the output amount with more precision
      const num = parseFloat(outputAmountFormatted);
      let formattedOutput: string;

      if (num < 0.0001) {
        // Use scientific notation for very small numbers
        formattedOutput = num.toExponential(6);
      } else if (num < 1) {
        // Use more decimals for small numbers
        formattedOutput = num.toFixed(8);
      } else {
        // Use fewer decimals for larger numbers
        formattedOutput = num.toFixed(4);
      }

      setOutputAmount(formattedOutput);
    } catch (err) {
      console.error("Error getting quote:", err);
      setSwapError("Failed to get quote. Please try again.");
      setOutputAmount("");
    } finally {
      setSwapLoading(false);
    }
  }

  // Execute swap
  async function executeSwap() {
    if (!address || !outputAmount) return;

    setSwapLoading(true);
    setSwapError(null);

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = provider.getSigner();

      const tokenIn = new Token(
        1,
        selectedPair.inputToken.address,
        selectedPair.inputToken.decimals,
        selectedPair.inputToken.symbol,
        selectedPair.inputToken.name
      );
      const tokenOut = new Token(
        1,
        selectedPair.outputToken.address,
        selectedPair.outputToken.decimals,
        selectedPair.outputToken.symbol,
        selectedPair.outputToken.name
      );

      const pool = await getPool(tokenIn, tokenOut, selectedPair.fee, provider);
      const inputAmountWei = parseUnits(
        inputAmount,
        selectedPair.inputToken.decimals
      );
      const typedValueParsed = CurrencyAmount.fromRawAmount(
        tokenIn,
        inputAmountWei.toString()
      );

      const route = new Route([pool], tokenIn, tokenOut);
      const trade = await Trade.fromRoute(
        route,
        typedValueParsed,
        TradeType.EXACT_INPUT
      );

      const slippageTolerance = new Percent("50", "10000"); // 0.5%
      const deadline = Math.floor(Date.now() / 1000) + 1800; // 30 minutes

      const swapParams = SwapRouter.swapCallParameters(trade, {
        slippageTolerance,
        recipient: address,
        deadline,
      });

      const tx = await signer.sendTransaction({
        data: swapParams.calldata,
        to: SWAP_ROUTER_ADDRESS,
        value: swapParams.value,
        from: address,
      });

      await tx.wait();
      fetchBalances();
    } catch (err) {
      console.error("Error executing swap:", err);
      setSwapError("Failed to execute swap. Please try again.");
    } finally {
      setSwapLoading(false);
    }
  }

  // Move this function outside useEffect
  async function fetchBalances() {
    if (!address) {
      setEthBalance(null);
      setUsdcBalance(null);
      return;
    }

    try {
      const provider = new ethers.providers.JsonRpcProvider(
        "https://eth-mainnet.public.blastapi.io"
      );

      // Get ETH balance
      const rawEthBalance = await provider.getBalance(address);
      const formattedEthBalance = ethers.utils.formatUnits(rawEthBalance, 18);
      setEthBalance(parseFloat(formattedEthBalance).toFixed(4));

      // Get USDC balance
      const usdcContract = new ethers.Contract(
        TOKENS.USDC.address,
        ERC20_ABI,
        provider
      );
      const rawUsdcBalance = await usdcContract.balanceOf(address);
      const usdcDecimals = await usdcContract.decimals();
      const formattedUsdcBalance = ethers.utils.formatUnits(
        rawUsdcBalance,
        usdcDecimals
      );
      setUsdcBalance(parseFloat(formattedUsdcBalance).toFixed(2));
    } catch (err) {
      console.error("Error fetching balances:", err);
      setEthBalance(null);
      setUsdcBalance(null);
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

  return (
    <Container fluid className={styles.uniswapContainer}>
      <Row className="w-100 justify-content-center">
        <Col xs={12} sm={10} md={8} lg={6} xl={5}>
          <div className={styles.swapCard}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h3>Swap</h3>
              <PriceDisplay
                pair={displayPair}
                forward={forward}
                reverse={reverse}
                loading={priceLoading}
                error={priceError}
              />
            </div>

            {!address ? (
              <div className="text-center p-4 bg-dark rounded">
                <p className="mb-0">
                  Please connect your wallet to swap tokens
                </p>
              </div>
            ) : (
              <Form>
                <div className={styles.inputGroup}>
                  <div className={styles.inputLabel}>
                    <span>You Pay</span>
                    <span className={styles.balance}>
                      Balance:{" "}
                      {selectedPair.inputToken.symbol === "ETH"
                        ? ethBalance
                        : usdcBalance ?? "..."}{" "}
                      {selectedPair.inputToken.symbol}
                    </span>
                  </div>
                  <div className={styles.inputWrapper}>
                    <Form.Control
                      type="number"
                      value={inputAmount}
                      onChange={(e) => {
                        setInputAmount(e.target.value);
                        setOutputAmount("");
                        setSwapError(null);
                      }}
                      placeholder="0.0"
                      min="0"
                      step="0.01"
                      className={styles.tokenInput}
                    />
                    <div className={styles.tokenSelector}>
                      {selectedPair.inputToken.symbol}
                    </div>
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
                      Balance:{" "}
                      {selectedPair.outputToken.symbol === "ETH"
                        ? ethBalance
                        : usdcBalance ?? "..."}{" "}
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
                    <div className={styles.tokenSelector}>
                      {selectedPair.outputToken.symbol}
                    </div>
                  </div>
                </div>

                <Button
                  variant="primary"
                  onClick={getQuote}
                  disabled={swapLoading || !inputAmount}
                  className={styles.actionButton}
                >
                  {swapLoading ? "Getting Quote..." : "Get Quote"}
                </Button>

                {swapError && (
                  <div className="alert alert-danger mb-3 py-2" role="alert">
                    {swapError}
                  </div>
                )}

                <Button
                  variant="success"
                  onClick={executeSwap}
                  disabled={!outputAmount || swapLoading}
                  className={styles.actionButton}
                >
                  {swapLoading ? "Swapping..." : "Swap"}
                </Button>
              </Form>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}
