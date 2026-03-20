import type { AppWallet } from "@/components/app-wallets/AppWalletsContext";
import type { AppKitAdapterManager } from "@/components/providers/AppKitAdapterManager";
import { publicEnv } from "@/config/env";
import { CW_PROJECT_ID } from "@/constants/constants";
import { isElectron } from "@/helpers";
import type { ISeedWallet } from "@/shared/types";
import { AdapterCacheError, AdapterError } from "@/src/errors/adapter";
import { isIndexedDBError, logErrorSecurely } from "@/utils/error-sanitizer";
import type { ChainAdapter } from "@reown/appkit/react";
import { createAppKit } from "@reown/appkit/react";
import type { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit-common";
import type { Chain } from "viem";
import { mainnet } from "viem/chains";

export interface AppKitInitializationConfig {
  wallets: AppWallet[];
  seedWallets?: ISeedWallet[] | undefined;
  adapterManager: AppKitAdapterManager;
  isCapacitor: boolean;
  chains?: Chain[] | undefined;
}

interface AppKitInitializationResult {
  adapter: WagmiAdapter;
  ready?: Promise<void> | undefined;
}

function debugLog(message: string, ...args: any[]): void {
  if (publicEnv.NODE_ENV === "development") {
    console.warn(`[AppKitInitialization] ${message}`, ...args);
  }
}

function createAdapter(
  wallets: AppWallet[],
  seedWallets: ISeedWallet[],
  adapterManager: AppKitAdapterManager,
  isCapacitor: boolean,
  chains: Chain[]
): WagmiAdapter {
  debugLog(
    `Initializing AppKit adapter (${isCapacitor ? "mobile" : "web"} - ${
      isElectron() ? "6529 Desktop" : "6529 Desktop Web"
    }) with`,
    wallets.length,
    "AppWallets"
  );

  try {
    return adapterManager.createAdapterWithCache(
      wallets,
      seedWallets,
      isCapacitor,
      chains
    );
  } catch (error) {
    if (isIndexedDBError(error)) {
      logErrorSecurely(
        "[AppKitInitialization] IndexedDB connection lost during adapter creation",
        error
      );
      throw new Error(
        "Browser storage connection lost. Please refresh the page to try again."
      );
    }

    if (error instanceof AdapterError || error instanceof AdapterCacheError) {
      logErrorSecurely("[AppKitInitialization] Adapter creation failed", error);
      throw new Error(
        `Wallet adapter setup failed: ${error.message}. Please refresh the page and try again.`
      );
    }

    logErrorSecurely(
      "[AppKitInitialization] Adapter creation failed with unexpected error",
      error
    );
    throw new Error(
      "Failed to initialize wallet connection. Please refresh the page and try again."
    );
  }
}

export function initializeAppKit(
  config: AppKitInitializationConfig
): AppKitInitializationResult {
  const {
    wallets,
    adapterManager,
    seedWallets = [],
    isCapacitor,
    chains = [mainnet],
  } = config;

  const newAdapter = createAdapter(
    wallets,
    seedWallets,
    adapterManager,
    isCapacitor,
    chains
  );
  const appKitConfig = buildAppKitConfig(newAdapter, chains);
  const appKit = createAppKit(appKitConfig);
  appKit.setEIP6963Enabled(false);
  const ready = appKit.ready();
  ready.catch((error) => {
    logErrorSecurely("[AppKitInitialization] AppKit ready() failed", error);
  });

  return {
    adapter: newAdapter,
    ready,
  };
}

function buildAppKitConfig(adapter: WagmiAdapter, chains: Chain[]) {
  if (chains.length === 0) {
    throw new Error(
      "AppKit initialization requires at least one configured chain."
    );
  }
  return {
    adapters: [adapter] as ChainAdapter[],
    networks: chains as [AppKitNetwork, ...AppKitNetwork[]],
    projectId: CW_PROJECT_ID,
    metadata: {
      name: "6529.io",
      description: "6529.io",
      url: publicEnv.BASE_ENDPOINT,
      icons: [
        "https://d3lqz0a4bldqgf.cloudfront.net/seize_images/Seize_Logo_Glasses_3.png",
      ],
    },
    themeVariables: {
      "--w3m-font-family": "'Montserrat', sans-serif",
    },
    enableWalletGuide: false,
    allWallets: isElectron() ? ("HIDE" as const) : ("SHOW" as const),
    featuredWalletIds: isElectron() ? [] : ["metamask", "walletConnect"],
    features: {
      analytics: true,
      email: false,
      socials: [],
      connectMethodsOrder: ["wallet" as const],
    },
    enableOnramp: false,
    enableSwaps: false,
  };
}
