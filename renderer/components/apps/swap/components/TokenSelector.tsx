import { Token } from "../types";
import styles from "./TokenSelector.module.scss";

interface Props {
  token: Token;
  onClick?: () => void;
  disabled?: boolean;
}

export default function TokenSelector({ token, onClick, disabled }: Props) {
  return (
    <div
      className={`${styles.tokenSelector} ${disabled ? styles.disabled : ""}`}
      onClick={!disabled ? onClick : undefined}
    >
      {token.logoURI && (
        <img
          src={token.logoURI}
          alt={token.symbol}
          className={styles.tokenLogo}
        />
      )}
      <span className={styles.tokenSymbol}>{token.symbol}</span>
    </div>
  );
}
