import { Token, TokenPair } from "./types";

export const TOKENS: { [key: string]: Token } = {
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
    decimals: 18,
    logoURI: "/images/tokens/eth.png",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    logoURI: "/images/tokens/usdc.png",
  },
  USDT: {
    symbol: "USDT",
    name: "Tether",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    decimals: 6,
    logoURI: "/images/tokens/usdt.png",
  },
  // Add more tokens as needed
};

export const TOKEN_PAIRS: TokenPair[] = [
  {
    inputToken: TOKENS.ETH,
    outputToken: TOKENS.USDC,
    poolAddress: "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
    fee: 3000, // 0.3%
  },
  {
    inputToken: TOKENS.ETH,
    outputToken: TOKENS.USDT,
    poolAddress: "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36",
    fee: 3000,
  },
  // Add more pairs as needed
];

export const TICK_LENS_ADDRESS = "0xbfd8137f7d1516D3ea5cA83523914859ec47F573";
