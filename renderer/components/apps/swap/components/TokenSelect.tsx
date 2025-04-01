import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { Token } from "../types";
import { createPortal } from "react-dom";
import { X, Search } from "lucide-react";

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
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Set mounted state after component mounts
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Filter tokens based on search query
  const filteredTokens = tokens.filter(
    (token) =>
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="tw-absolute tw-right-2 tw-top-1/2 tw-transform tw--translate-y-1/2">
      <button
        ref={buttonRef}
        className="tw-bg-white/[0.08] tw-border tw-border-white/10 tw-rounded-xl tw-py-2 tw-px-3 tw-text-white/90 tw-font-medium tw-cursor-pointer tw-transition-all tw-duration-200 tw-flex tw-items-center tw-gap-2 tw-min-w-[110px] hover:tw-bg-transparent focus:tw-bg-transparent hover:tw-border-white/15 focus:tw-border-white/15 focus:tw-outline-none tw-disabled:opacity-50 tw-disabled:cursor-not-allowed"
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      >
        <div className="tw-flex tw-items-center tw-gap-2">
          {selectedToken.logoURI && (
            <div className="tw-w-6 tw-h-6 tw-rounded-full tw-overflow-hidden tw-flex-shrink-0 tw-bg-white/10 tw-flex tw-items-center tw-justify-center">
              <Image
                src={selectedToken.logoURI}
                alt={selectedToken.symbol}
                width={24}
                height={24}
                style={{ borderRadius: "50%" }}
              />
            </div>
          )}
          <span className="tw-text-base tw-font-medium">
            {selectedToken.symbol}
          </span>
        </div>
      </button>

      {isOpen &&
        mounted &&
        createPortal(
          <div className="tw-fixed tw-inset-0 tw-bg-black/70 tw-flex tw-items-center tw-justify-center tw-p-4 tw-z-[99999]">
            <div
              className="tw-bg-[#121212] tw-border tw-border-white/10 tw-rounded-2xl tw-w-full tw-max-w-md tw-max-h-[90vh] tw-flex tw-flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="tw-flex tw-items-center tw-justify-between tw-p-4 tw-border-b tw-border-white/10">
                <h3 className="tw-text-white tw-text-lg tw-font-medium">
                  Select a token
                </h3>
                <button
                  className="tw-bg-white/[0.08] tw-border tw-border-white/10 tw-rounded-xl tw-py-2 tw-px-2 tw-text-white tw-font-medium tw-cursor-pointer tw-transition-all tw-duration-200 tw-flex tw-items-center tw-justify-center hover:tw-bg-white/[0.12]"
                  onClick={() => {
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Search Input */}
              <div className="tw-p-4 tw-border-b tw-border-white/10">
                <div className="tw-relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search token name or symbol"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="tw-w-full tw-bg-white/5 tw-border tw-border-white/10 tw-rounded-xl tw-py-3 tw-pl-10 tw-pr-4 tw-text-white tw-placeholder-white/40 focus:tw-outline-none focus:tw-border-white/20"
                  />
                  <Search
                    className="tw-absolute tw-left-3 tw-top-1/2 tw-transform tw--translate-y-1/2 tw-text-white/40"
                    size={18}
                  />
                </div>
              </div>

              {/* Token List */}
              <div className="tw-overflow-y-auto tw-flex-1 tw-p-2">
                {filteredTokens.length === 0 ? (
                  <div className="tw-text-white/60 tw-text-center tw-py-8">
                    No tokens found
                  </div>
                ) : (
                  filteredTokens.map((token) => (
                    <button
                      key={token.address}
                      className="tw-w-full tw-py-3 tw-px-3 tw-bg-transparent tw-border-none tw-rounded-xl tw-text-white tw-cursor-pointer tw-transition-all tw-duration-200 hover:tw-bg-white/[0.05] tw-flex tw-items-center tw-gap-3"
                      onClick={() => {
                        onSelect(token);
                        setIsOpen(false);
                        setSearchQuery("");
                      }}
                    >
                      {token.logoURI ? (
                        <div className="tw-w-8 tw-h-8 tw-rounded-full tw-overflow-hidden tw-flex-shrink-0 tw-bg-white/10 tw-flex tw-items-center tw-justify-center">
                          <Image
                            src={token.logoURI}
                            alt={token.symbol}
                            width={32}
                            height={32}
                            style={{ borderRadius: "50%" }}
                          />
                        </div>
                      ) : (
                        <div className="tw-w-8 tw-h-8 tw-rounded-full tw-flex-shrink-0 tw-bg-white/10 tw-flex tw-items-center tw-justify-center">
                          <span className="tw-text-white tw-text-sm">
                            {token.symbol.substring(0, 2)}
                          </span>
                        </div>
                      )}
                      <div className="tw-flex tw-flex-col tw-items-start tw-gap-0.5 tw-text-left">
                        <span className="tw-text-base tw-font-medium">
                          {token.symbol}
                        </span>
                        <span className="tw-text-sm tw-text-white/60">
                          {token.name}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
