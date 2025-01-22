import { Token, TokenPair } from "./types";
import { ethers } from "ethersv5";
import { CurrencyAmount, TradeType } from "@uniswap/sdk-core";

interface ChainTokens {
  [chainId: number]: {
    [symbol: string]: Token;
  };
}

interface ChainPools {
  [chainId: number]: TokenPair[];
}

export function ensureChecksum(address: string): string {
  return ethers.utils.getAddress(address.toLowerCase());
}

// Add native ETH definition
export const NATIVE_ETH: Token = {
  symbol: "ETH",
  name: "Ethereum",
  address: "ETH".toLowerCase(),
  decimals: 18,
  logoURI: "/tokens/eth.svg",
  isNative: true,
};

export const CHAIN_TOKENS: ChainTokens = {
  1: {
    ETH: NATIVE_ETH,
    WETH: {
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      decimals: 18,
      logoURI: "/tokens/weth.svg",
      isWrapped: true,
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      logoURI: "/tokens/usdc.svg",
    },
    UNI: {
      symbol: "UNI",
      name: "Uniswap",
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      decimals: 18,
      logoURI: "/tokens/uni.svg",
    },
  },
  11155111: {
    // Sepolia
    ETH: NATIVE_ETH,
    WETH: {
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
      decimals: 18,
      logoURI: "/tokens/weth.svg",
      isWrapped: true,
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
      decimals: 6,
      logoURI: "/tokens/usdc.svg",
    },
    UNI: {
      symbol: "UNI",
      name: "Uniswap",
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // Using mainnet address for testing
      decimals: 18,
      logoURI: "/tokens/uni.svg",
    },
  },
};

export const CHAIN_POOLS: ChainPools = {
  1: [
    {
      inputToken: CHAIN_TOKENS[1].ETH,
      outputToken: CHAIN_TOKENS[1].USDC,
      poolAddress: "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
      fee: 3000,
      useWETH: true, // Add this flag
    },
    {
      inputToken: CHAIN_TOKENS[1].ETH,
      outputToken: CHAIN_TOKENS[1].UNI,
      poolAddress: "0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f7",
      fee: 3000,
    },
  ],
  11155111: [
    {
      inputToken: CHAIN_TOKENS[11155111].UNI,
      outputToken: CHAIN_TOKENS[11155111].WETH,
      poolAddress: "0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f7",
      fee: 3000,
    },
    {
      inputToken: CHAIN_TOKENS[11155111].WETH,
      outputToken: CHAIN_TOKENS[11155111].USDC,
      poolAddress: "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1",
      fee: 3000,
    },
  ],
};

// For backward compatibility
export const TOKENS = CHAIN_TOKENS[1];
export const TOKEN_PAIRS = CHAIN_POOLS[1];

export const CHAIN_QUOTER_ADDRESSES: Record<SupportedChainId, string> = {
  1: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", // Mainnet Quoter V2
  11155111: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3", // Sepolia Quoter V2
};

export const SEPOLIA_RPC =
  "https://cosmological-thrumming-meme.ethereum-sepolia.quiknode.pro/b0c4b6585d341d9bad54707aa3dca895f7c17899";

export const QUOTER_CONTRACT_ADDRESS = CHAIN_QUOTER_ADDRESSES[11155111];

// Add type for supported chain IDs
export type SupportedChainId = 1 | 11155111;

export const CHAIN_ROUTER_ADDRESSES: Record<SupportedChainId, string> = {
  1: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // Mainnet SwapRouter02
  11155111: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E", // Sepolia SwapRouter02
};

export const TICK_LENS_ADDRESS: Record<SupportedChainId, string> = {
  1: "0xbfd8137f7d1516D3ea5cA83523914859ec47F573",
  11155111: "",
};

export const SWAP_ROUTER_ADDRESS = CHAIN_ROUTER_ADDRESSES;

export const UNIVERSAL_ROUTER_ADDRESS: Record<SupportedChainId, string> = {
  1: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  11155111: "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
};

export const WETH_ADDRESS: Record<SupportedChainId, string> = {
  1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  11155111: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
};

export const UNISWAP_V3_FACTORY_ADDRESS: Record<SupportedChainId, string> = {
  1: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  11155111: "0x0227628F3F023bb08980b67D528571c95c6DaC1c",
};
