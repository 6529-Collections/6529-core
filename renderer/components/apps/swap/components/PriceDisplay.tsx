import { Token, TokenPair } from "../types";
import { RotateCw } from "lucide-react";
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

  if (num < 0.0001) {
    return num.toExponential(4);
  }

  if (token.decimals <= 6) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }

  if (num >= 1000) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } else if (num >= 1) {
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  } else {
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
  if (error) {
    return (
      <div className={`${styles.priceDisplay} ${styles.error}`}>
        <div className={styles.errorContent}>
          <span>{error}</span>
          <button className={styles.retryButton}>
            <RotateCw size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.priceDisplay}>
      <div className={styles.priceContent}>
        <div className={styles.priceRow}>
          <div className={styles.priceLabel}>
            <span className={styles.amount}>1</span>
            <span className={styles.symbol}>{pair.inputToken.symbol}</span>
          </div>
          <div
            className={`${styles.priceValue} ${loading ? styles.loading : ""}`}
          >
            {forward ? formatPrice(forward, pair.outputToken) : "0.00"}
            <span className={styles.symbol}>{pair.outputToken.symbol}</span>
          </div>
        </div>
        <div className={styles.priceRow}>
          <div className={styles.priceLabel}>
            <span className={styles.amount}>1</span>
            <span className={styles.symbol}>{pair.outputToken.symbol}</span>
          </div>
          <div
            className={`${styles.priceValue} ${loading ? styles.loading : ""}`}
          >
            {reverse ? formatPrice(reverse, pair.inputToken) : "0.00"}
            <span className={styles.symbol}>{pair.inputToken.symbol}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
