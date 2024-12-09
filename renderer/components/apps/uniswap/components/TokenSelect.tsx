import { Token, TokenPair } from "../types";
import styles from "./TokenSelect.module.scss";

interface Props {
  tokens: Token[];
  selectedToken: Token;
  onSelect: (token: Token) => void;
  disabled?: boolean;
}

export default function TokenSelect({
  tokens,
  selectedToken,
  onSelect,
  disabled,
}: Props) {
  return (
    <div className={styles.tokenSelectWrapper}>
      <select
        className={styles.tokenSelect}
        value={selectedToken.symbol}
        onChange={(e) => {
          const token = tokens.find((t) => t.symbol === e.target.value);
          if (token) onSelect(token);
        }}
        disabled={disabled}
      >
        {tokens.map((token) => (
          <option key={token.symbol} value={token.symbol}>
            {token.symbol}
          </option>
        ))}
      </select>
    </div>
  );
}
