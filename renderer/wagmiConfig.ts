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
import { metaMask } from "wagmi/connectors";
import { SEIZE_URL } from "../constants";
import { browserConnector } from "./browserConnector";
import { isElectron } from "./helpers";

export function getChains() {
  const chains: Chain[] = [mainnet];
  if (
    DELEGATION_CONTRACT.chain_id === sepolia.id ||
    (NEXTGEN_CHAIN_ID as number) === sepolia.id ||
    SUBSCRIPTIONS_CHAIN.id.toString() === sepolia.id.toString() ||
    MANIFOLD_NETWORK.id.toString() === sepolia.id.toString()
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
  name: "Seize",
  description: "6529 SEIZE",
  url: SEIZE_URL,
  icons: [
    "https://d3lqz0a4bldqgf.cloudfront.net/seize_images/Seize_Logo_Glasses_3.png",
  ],
};

const isBrowser = !isElectron();

const connectors = [];

if (!isBrowser) {
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
  const metamask = metaMask({
    shouldShimWeb3: true,
    dappMetadata: metadata,
    preferDesktop: !isElectron(),
  });
  connectors.push(chrome, firefox, brave, metamask);
}

export const wagmiConfig = defaultWagmiConfig({
  chains: [...CONTRACT_CHAINS] as [Chain, ...Chain[]],
  projectId: CW_PROJECT_ID,
  metadata,
  coinbasePreference: "all",
  enableCoinbase: true,
  enableWalletConnect: true,
  auth: {
    email: false,
  },
  connectors,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
