import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { Token } from "../types";
import styles from "../UniswapApp.module.scss";

interface TokenSelectProps {
  tokens: Token[];
  selectedToken: Token;
  onSelect: (token: Token) => void;
  disabled?: boolean;
}

export function TokenSelect({
  tokens,
  selectedToken,
  onSelect,
  disabled,
}: TokenSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className={styles.tokenSelect} ref={dropdownRef}>
      <button
        ref={buttonRef}
        className={styles.tokenButton}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={styles.tokenButtonContent}>
          {selectedToken.logoURI && (
            <div className={styles.tokenLogo}>
              <Image
                src={selectedToken.logoURI}
                alt={selectedToken.symbol}
                width={24}
                height={24}
                style={{ borderRadius: "50%" }}
              />
            </div>
          )}
          <span className={styles.tokenSymbol}>{selectedToken.symbol}</span>
        </div>
      </button>

      {isOpen && (
        <div
          className={styles.tokenDropdown}
          onClick={(e) => e.stopPropagation()}
        >
          {tokens.map((token) => (
            <button
              key={token.address}
              className={styles.tokenOption}
              onClick={() => {
                onSelect(token);
                setIsOpen(false);
              }}
            >
              <div className={styles.tokenOptionContent}>
                {token.logoURI && (
                  <div className={styles.tokenLogo}>
                    <Image
                      src={token.logoURI}
                      alt={token.symbol}
                      width={24}
                      height={24}
                      style={{ borderRadius: "50%" }}
                    />
                  </div>
                )}
                <div className={styles.tokenInfo}>
                  <span className={styles.tokenSymbol}>{token.symbol}</span>
                  <span className={styles.tokenName}>{token.name}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
