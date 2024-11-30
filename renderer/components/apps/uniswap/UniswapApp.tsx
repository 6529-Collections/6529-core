import { useState, useEffect } from "react";
import { Container, Row, Col, Form, Button } from "react-bootstrap";
import { useAccount } from "wagmi";
import { ethers } from "ethers";
import styles from "./UniswapApp.module.scss";

// Constants
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH_USDC_POOL = "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8";

// ABIs
const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const UNISWAP_V3_POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
];

export default function UniswapApp() {
  const { address } = useAccount();
  const [inputAmount, setInputAmount] = useState("");
  const [outputAmount, setOutputAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ethBalance, setEthBalance] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<string | null>(null);

  // Get pool price
  useEffect(() => {
    async function fetchPrice() {
      try {
        const provider = new ethers.JsonRpcProvider(
          "https://eth-mainnet.public.blastapi.io"
        );
        const poolContract = new ethers.Contract(
          WETH_USDC_POOL,
          UNISWAP_V3_POOL_ABI,
          provider
        );

        const slot0 = await poolContract.slot0();
        const sqrtPriceX96 = BigInt(slot0[0].toString());
        const Q96 = BigInt(2 ** 96);

        // Calculate WETH/USDC price with decimal adjustment
        const priceInUSDC = Number(
          (BigInt(1e12) * (Q96 * Q96)) / (sqrtPriceX96 * sqrtPriceX96)
        );

        if (priceInUSDC <= 0 || isNaN(priceInUSDC)) {
          throw new Error("Invalid price calculation");
        }

        setCurrentPrice(priceInUSDC.toFixed(2));
      } catch (err) {
        console.error("Error fetching price:", err);
        setCurrentPrice(null);
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 10000);
    return () => clearInterval(interval);
  }, []);

  // Get user's ETH and USDC balances
  useEffect(() => {
    async function fetchBalances() {
      if (!address) {
        setEthBalance(null);
        setUsdcBalance(null);
        return;
      }

      try {
        const provider = new ethers.JsonRpcProvider(
          "https://eth-mainnet.public.blastapi.io"
        );

        // Get ETH balance
        const rawEthBalance = await provider.getBalance(address);
        const formattedEthBalance = ethers.formatUnits(rawEthBalance, 18);
        setEthBalance(parseFloat(formattedEthBalance).toFixed(4));

        // Get USDC balance
        const usdcContract = new ethers.Contract(
          USDC_ADDRESS,
          USDC_ABI,
          provider
        );
        const rawUsdcBalance = await usdcContract.balanceOf(address);
        const usdcDecimals = await usdcContract.decimals();
        const formattedUsdcBalance = ethers.formatUnits(
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

    fetchBalances();
  }, [address]);

  async function getQuote() {
    if (!inputAmount || !address || !currentPrice) return;

    setLoading(true);
    setError(null);

    try {
      const calculatedAmount =
        parseFloat(inputAmount) * parseFloat(currentPrice);
      setOutputAmount(calculatedAmount.toFixed(2));
    } catch (err) {
      console.error("Error getting quote:", err);
      setError("Failed to get quote. Please try again.");
      setOutputAmount("");
    } finally {
      setLoading(false);
    }
  }

  async function executeSwap() {
    if (!address) return;
    alert("Swap functionality will be implemented later");
  }

  return (
    <Container fluid className={styles.uniswapContainer}>
      <Row className="w-100 justify-content-center">
        <Col xs={12} sm={10} md={8} lg={6} xl={5}>
          <div className={styles.swapCard}>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h3>Swap</h3>
              {currentPrice && (
                <div className={styles.priceInfo}>
                  1 ETH = {currentPrice} USDC
                </div>
              )}
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
                      Balance: {ethBalance ?? "..."} ETH
                    </span>
                  </div>
                  <div className={styles.inputWrapper}>
                    <Form.Control
                      type="number"
                      value={inputAmount}
                      onChange={(e) => {
                        setInputAmount(e.target.value);
                        setOutputAmount("");
                        setError(null);
                      }}
                      placeholder="0.0"
                      min="0"
                      step="0.01"
                      className={styles.tokenInput}
                    />
                    <div className={styles.tokenSelector}>ETH</div>
                  </div>
                </div>

                <div className={styles.inputGroup}>
                  <div className={styles.inputLabel}>
                    <span>You Receive</span>
                    <span className={styles.balance}>
                      Balance: {usdcBalance ?? "..."} USDC
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
                    <div className={styles.tokenSelector}>USDC</div>
                  </div>
                </div>

                {error && (
                  <div className="alert alert-danger mb-3 py-2" role="alert">
                    {error}
                  </div>
                )}

                <Button
                  variant="primary"
                  onClick={getQuote}
                  disabled={loading || !inputAmount}
                  className={styles.actionButton}
                >
                  {loading ? "Getting Quote..." : "Get Quote"}
                </Button>

                <Button
                  variant="success"
                  onClick={executeSwap}
                  disabled={!outputAmount || loading}
                  className={styles.actionButton}
                >
                  Swap
                </Button>
              </Form>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}
