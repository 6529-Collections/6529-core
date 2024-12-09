import { TokenPair } from "../types";
import styles from "./PriceDisplay.module.scss";

interface Props {
  pair: TokenPair;
  forward: string | null;
  reverse: string | null;
  loading?: boolean;
  error?: string | null;
}

function formatPrice(
  price: string,
  token: Token,
  maxDecimals: number = 6
): string {
  const num = parseFloat(price);

  // Handle very small numbers
  if (num < 0.0001) {
    return num.toExponential(4);
  }

  // Handle stable coins (USDC, USDT, etc.)
  if (token.decimals <= 6) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  // Handle ETH and similar tokens
  if (num >= 1000) {
    // Large numbers: show fewer decimals
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else if (num >= 1) {
    // Medium numbers: show more precision
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } else {
    // Small numbers: show even more precision
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: maxDecimals,
    });
  }
}

export default function PriceDisplay({
  pair,
  forward,
  reverse,
  loading,
  error,
}: Props) {
  if (loading) {
    return <div className={styles.priceDisplay}>Fetching price...</div>;
  }

  if (error) {
    return (
      <div className={`${styles.priceDisplay} ${styles.error}`}>{error}</div>
    );
  }

  if (!forward || !reverse) {
    return null;
  }

  return (
    <div className={styles.priceDisplay}>
      <div className={styles.priceRow}>
        <span className={styles.amount}>1</span>
        <span className={styles.token}>{pair.inputToken.symbol}</span>
        <span className={styles.equals}>=</span>
        <span className={styles.amount}>
          {formatPrice(forward, pair.outputToken)}
        </span>
        <span className={styles.token}>{pair.outputToken.symbol}</span>
      </div>
      <div className={styles.priceRow}>
        <span className={styles.amount}>1</span>
        <span className={styles.token}>{pair.outputToken.symbol}</span>
        <span className={styles.equals}>=</span>
        <span className={styles.amount}>
          {formatPrice(reverse, pair.inputToken)}
        </span>
        <span className={styles.token}>{pair.inputToken.symbol}</span>
      </div>
    </div>
  );
}
