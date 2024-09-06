import { mainnet, goerli, sepolia } from "viem/chains";
import { Chain, http } from "viem";
import { NEXTGEN_CHAIN_ID } from "./components/nextGen/nextgen_contracts";
import {
  CW_PROJECT_ID,
  DELEGATION_CONTRACT,
  SUBSCRIPTIONS_CHAIN,
} from "./constants";
import { MANIFOLD_NETWORK } from "./hooks/useManifoldClaim";
import { defaultWagmiConfig } from "@web3modal/wagmi/react/config";
import { SEIZE_URL } from "../constants";
import { browserConnector } from "./browserConnector";
import { isElectron } from "./helpers";
import { SEED_WALLETS_NETWORK } from "./components/network/seedWallet/SeedWallets";
import { getSeedWallets } from "./electron";
import { ISeedWallet } from "../shared/types";
import { ethers } from "ethers";
import { seedWalletConnector } from "./seedWalletConnector";
import { WalletAddress } from "./components/address/WalletAddress";

export function getChains() {
  const chains: Chain[] = [mainnet];
  if (
    DELEGATION_CONTRACT.chain_id === sepolia.id ||
    (NEXTGEN_CHAIN_ID as number) === sepolia.id ||
    SUBSCRIPTIONS_CHAIN.id.toString() === sepolia.id.toString() ||
    MANIFOLD_NETWORK.id.toString() === sepolia.id.toString() ||
    SEED_WALLETS_NETWORK.id.toString() === sepolia.id.toString()
  ) {
    chains.push(sepolia);
  }
  if (
    DELEGATION_CONTRACT.chain_id === goerli.id ||
    (NEXTGEN_CHAIN_ID as number) === goerli.id
  ) {
    chains.push(goerli);
  }
  return chains;
}

const CONTRACT_CHAINS = getChains();

const metadata = {
  name: "6529 CORE",
  description: "6529 CORE",
  url: SEIZE_URL,
  icons: [
    "https://d3lqz0a4bldqgf.cloudfront.net/seize_images/Seize_Logo_Glasses_3.png",
  ],
};

export async function getWagmiConfig() {
  const connectors = [];

  if (isElectron()) {
    const seedWallets = await getSeedWallets();
    seedWallets?.data.forEach((wallet: ISeedWallet) => {
      const seedConnector = seedWalletConnector({
        address: wallet.address,
        name: wallet.name,
      });
      connectors.push(seedConnector);
    });
    const chrome = browserConnector({
      openUrlFn: (url: string) => {
        window.api.openExternalChrome(url);
      },
      name: "Chrome",
      id: "chrome",
      icon: "/chrome.svg",
    });
    const firefox = browserConnector({
      openUrlFn: (url: string) => {
        window.api.openExternalFirefox(url);
      },
      name: "Firefox",
      id: "firefox",
      icon: "/firefox.svg",
    });
    const brave = browserConnector({
      openUrlFn: (url: string) => {
        window.api.openExternalBrave(url);
      },
      name: "Brave",
      id: "brave",
      icon: "/brave.svg",
    });
    connectors.push(chrome, firefox, brave);
  }

  const wagmiConfig = defaultWagmiConfig({
    chains: [...CONTRACT_CHAINS] as [Chain, ...Chain[]],
    projectId: CW_PROJECT_ID,
    metadata,
    coinbasePreference: "all",
    enableCoinbase: true,
    enableWalletConnect: true,
    enableInjected: false,
    auth: {
      email: false,
    },
    connectors,
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
    },
  });

  return wagmiConfig;
}
