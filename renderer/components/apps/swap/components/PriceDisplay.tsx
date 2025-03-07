import { Token, TokenPair } from "../types";
import { RotateCw, Fuel } from "lucide-react";
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits } from "viem";

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
  const publicClient = usePublicClient();
  const [gasPrice, setGasPrice] = useState<string | null>(null);
  const [gasPriceUsd, setGasPriceUsd] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [fetchingGas, setFetchingGas] = useState(false);

  // Fetch gas price
  useEffect(() => {
    const fetchGasPrice = async () => {
      if (!publicClient) return;

      try {
        setFetchingGas(true);
        const gasPrice = await publicClient.getGasPrice();
        const gasPriceGwei = formatUnits(gasPrice, 9); // Convert to gwei
        setGasPrice(gasPriceGwei);

        // Fetch ETH price in USD from Coingecko
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await response.json();
        const ethUsdPrice = data.ethereum.usd;
        setEthPrice(ethUsdPrice);

        // Calculate gas price in USD (for a standard transaction of ~21000 gas)
        // 1 gwei = 0.000000001 ETH
        const gasPriceEth = parseFloat(gasPriceGwei) * 0.000000001 * 21000;
        const gasPriceUsd = (gasPriceEth * ethUsdPrice).toFixed(2);
        setGasPriceUsd(gasPriceUsd);
      } catch (error) {
        console.error("Error fetching gas price:", error);
      } finally {
        setFetchingGas(false);
      }
    };

    fetchGasPrice();

    // Refresh gas price every 30 seconds
    const interval = setInterval(fetchGasPrice, 30000);
    return () => clearInterval(interval);
  }, [publicClient]);

  if (error) {
    return (
      <div className="tw-bg-[rgba(255,107,107,0.1)] tw-border tw-border-[rgba(255,107,107,0.2)] tw-rounded-xl tw-p-3 tw-px-5 tw-text-[0.9rem] tw-text-[#ff6b6b] tw-transition-all tw-duration-200 tw-min-h-[72px] tw-flex tw-items-center tw-justify-center md:tw-min-h-[64px] md:tw-p-2.5 md:tw-px-4 md:tw-text-[0.85rem]">
        <div className="tw-flex tw-items-center tw-gap-2 tw-justify-center">
          <span>{error}</span>
          <button className="tw-bg-transparent tw-border-0 tw-p-1 tw-text-inherit tw-cursor-pointer tw-opacity-80 tw-transition-all tw-duration-200 hover:tw-opacity-100 hover:tw-rotate-180">
            <RotateCw size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-bg-[rgba(26,26,26,0.8)] tw-border tw-border-[rgba(255,255,255,0.05)] tw-rounded-xl tw-p-3 tw-px-5 tw-text-[0.9rem] tw-text-[rgba(255,255,255,0.9)] tw-transition-all tw-duration-200 tw-min-h-[72px] tw-flex tw-flex-col md:tw-min-h-[64px] md:tw-p-2.5 md:tw-px-4 md:tw-text-[0.85rem]">
      <div className="tw-w-full">
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-6 tw-mb-2">
          <div className="tw-flex tw-items-center tw-gap-1.5 tw-text-[rgba(255,255,255,0.6)] tw-font-medium tw-whitespace-nowrap tw-min-w-[80px]">
            <span className="tw-text-[rgba(255,255,255,0.9)]">1</span>
            <span className="tw-text-[rgba(255,255,255,0.6)]">
              {pair.inputToken.symbol}
            </span>
          </div>
          <div
            className={`tw-font-medium tw-font-['ui-monospace',SFMono-Regular,Menlo,Monaco,Consolas,monospace] tw-text-right tw-relative tw-whitespace-nowrap tw-text-[rgba(255,255,255,0.9)] tw-flex tw-items-center tw-gap-1.5 ${
              loading
                ? 'after:tw-content-[""] after:tw-absolute after:tw-inset-0 after:tw-bg-gradient-to-r after:tw-from-[rgba(255,255,255,0.05)] after:tw-via-[rgba(255,255,255,0.1)] after:tw-to-[rgba(255,255,255,0.05)] after:tw-bg-[length:200%_100%] after:tw-animate-[shimmer_1.5s_infinite] after:tw-rounded'
                : ""
            }`}
          >
            {forward ? formatPrice(forward, pair.outputToken) : "0.00"}
            <span className="tw-text-[rgba(255,255,255,0.6)]">
              {pair.outputToken.symbol}
            </span>
          </div>
        </div>
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-6">
          <div className="tw-flex tw-items-center tw-gap-1.5 tw-text-[rgba(255,255,255,0.6)] tw-font-medium tw-whitespace-nowrap tw-min-w-[80px]">
            <span className="tw-text-[rgba(255,255,255,0.9)]">1</span>
            <span className="tw-text-[rgba(255,255,255,0.6)]">
              {pair.outputToken.symbol}
            </span>
          </div>
          <div
            className={`tw-font-medium tw-font-['ui-monospace',SFMono-Regular,Menlo,Monaco,Consolas,monospace] tw-text-right tw-relative tw-whitespace-nowrap tw-text-[rgba(255,255,255,0.9)] tw-flex tw-items-center tw-gap-1.5 ${
              loading
                ? 'after:tw-content-[""] after:tw-absolute after:tw-inset-0 after:tw-bg-gradient-to-r after:tw-from-[rgba(255,255,255,0.05)] after:tw-via-[rgba(255,255,255,0.1)] after:tw-to-[rgba(255,255,255,0.05)] after:tw-bg-[length:200%_100%] after:tw-animate-[shimmer_1.5s_infinite] after:tw-rounded'
                : ""
            }`}
          >
            {reverse ? formatPrice(reverse, pair.inputToken) : "0.00"}
            <span className="tw-text-[rgba(255,255,255,0.6)]">
              {pair.inputToken.symbol}
            </span>
          </div>
        </div>
      </div>

      {/* Gas Price Information */}
      <div className="tw-w-full tw-mt-2 tw-pt-2 tw-border-t tw-border-white/5">
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-2">
          <div className="tw-flex tw-items-center tw-gap-1.5 tw-text-[rgba(255,255,255,0.6)] tw-font-medium tw-whitespace-nowrap">
            <Fuel size={12} className="tw-text-[#ffb019]" />
            <span className="tw-text-[rgba(255,255,255,0.6)] tw-text-xs">
              Gas:
            </span>
          </div>
          <div
            className={`tw-font-medium tw-font-['ui-monospace',SFMono-Regular,Menlo,Monaco,Consolas,monospace] tw-text-right tw-relative tw-whitespace-nowrap tw-text-[rgba(255,255,255,0.9)] tw-flex tw-items-center tw-gap-1.5 tw-text-xs ${
              fetchingGas
                ? 'after:tw-content-[""] after:tw-absolute after:tw-inset-0 after:tw-bg-gradient-to-r after:tw-from-[rgba(255,255,255,0.05)] after:tw-via-[rgba(255,255,255,0.1)] after:tw-to-[rgba(255,255,255,0.05)] after:tw-bg-[length:200%_100%] after:tw-animate-[shimmer_1.5s_infinite] after:tw-rounded'
                : ""
            }`}
          >
            {gasPrice ? (
              <>
                <span>{parseFloat(gasPrice).toFixed(1)} gwei</span>
                <span className="tw-text-[rgba(255,255,255,0.5)]">
                  {gasPriceUsd ? `≈ $${gasPriceUsd}` : ""}
                </span>
              </>
            ) : (
              <span className="tw-text-[rgba(255,255,255,0.5)]">
                Loading...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
