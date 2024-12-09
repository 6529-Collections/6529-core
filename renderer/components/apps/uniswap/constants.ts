import { Token, TokenPair } from "./types";

interface ChainTokens {
  [chainId: number]: {
    [symbol: string]: Token;
  };
}

interface ChainPools {
  [chainId: number]: TokenPair[];
}

export const CHAIN_TOKENS: ChainTokens = {
  1: {
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
    UNI: {
      symbol: "UNI",
      name: "Uniswap",
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      decimals: 18,
      logoURI: "/images/tokens/uni.png",
    },
  },
  11155111: {
    // Sepolia
    ETH: {
      symbol: "ETH",
      name: "Ethereum",
      address: "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9", // Sepolia WETH
      decimals: 18,
      logoURI: "/images/tokens/eth.png",
    },
    USDC: {
      symbol: "USDC",
      name: "USD Coin",
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // Sepolia USDC
      decimals: 6,
      logoURI: "/images/tokens/usdc.png",
    },
    UNI: {
      symbol: "UNI",
      name: "Uniswap",
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", // Using mainnet address for testing
      decimals: 18,
      logoURI: "/images/tokens/uni.png",
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
      inputToken: CHAIN_TOKENS[11155111].ETH,
      outputToken: CHAIN_TOKENS[11155111].USDC,
      poolAddress: "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1", // Updated Sepolia pool
      fee: 3000,
    },
    {
      inputToken: CHAIN_TOKENS[11155111].ETH,
      outputToken: CHAIN_TOKENS[11155111].UNI,
      poolAddress: "0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f7", // Using mainnet pool for testing
      fee: 3000,
    },
  ],
};

// For backward compatibility
export const TOKENS = CHAIN_TOKENS[1];
export const TOKEN_PAIRS = CHAIN_POOLS[1];

export const RPC_URLS = {
  1: "https://eth-mainnet.public.blastapi.io",
  11155111: "https://eth-sepolia.public.blastapi.io",
};

export const TICK_LENS_ADDRESS = "0xbfd8137f7d1516D3ea5cA83523914859ec47F573";

export const CHAIN_QUOTER_ADDRESSES = {
  1: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6", // Mainnet
  11155111: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", // Sepolia Quoter
};

export const CHAIN_ROUTER_ADDRESSES = {
  1: "0xE592427A0AEce92De3Edee1F18E0157C05861564", // Mainnet
  11155111: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", // Sepolia SwapRouter
};

// For backward compatibility
export const QUOTER_CONTRACT_ADDRESS = CHAIN_QUOTER_ADDRESSES[1];
export const SWAP_ROUTER_ADDRESS = CHAIN_ROUTER_ADDRESSES[1];
