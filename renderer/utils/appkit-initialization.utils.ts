import { AppWallet } from "@/components/app-wallets/AppWalletsContext";
import { AppKitAdapterManager } from "@/components/providers/AppKitAdapterManager";
import { publicEnv } from "@/config/env";
import { CW_PROJECT_ID } from "@/constants";
import { isElectron } from "@/helpers";
import { ISeedWallet } from "@/shared/types";
import { AdapterCacheError, AdapterError } from "@/src/errors/adapter";
import { logErrorSecurely } from "@/utils/error-sanitizer";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit-common";
import { createAppKit } from "@reown/appkit/react";
import { mainnet } from "viem/chains";

// Configuration interface for AppKit initialization
export interface AppKitInitializationConfig {
  wallets: AppWallet[];
  seedWallets: ISeedWallet[];
  adapterManager: AppKitAdapterManager;
  isCapacitor: boolean;
}

// Result interface
export interface AppKitInitializationResult {
  adapter: WagmiAdapter;
}

/**
 * Debug logger helper to reduce conditional complexity
 */
function debugLog(message: string, ...args: any[]): void {
  if (publicEnv.NODE_ENV === "development") {
    console.log(`[AppKitInitialization] ${message}`, ...args);
  }
}

/**
 * Creates adapter with proper error handling
 */
function createAdapter(
  wallets: AppWallet[],
  seedWallets: ISeedWallet[],
  adapterManager: AppKitAdapterManager,
  isCapacitor: boolean
): WagmiAdapter {
  debugLog(
    `Initializing AppKit adapter (${isCapacitor ? "mobile" : "web"} - ${
      isElectron() ? "Core Desktop" : "Core Web"
    }) with`,
    wallets.length,
    "AppWallets"
  );

  try {
    return adapterManager.createAdapterWithCache(wallets, seedWallets);
  } catch (error) {
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

/**
 * Initializes AppKit with wallets using a fail-fast approach with retry logic
 * Extracted from WagmiSetup component for better maintainability and testability
 */
export function initializeAppKit(
  config: AppKitInitializationConfig
): AppKitInitializationResult {
  const { wallets, adapterManager, seedWallets, isCapacitor } = config;

  const newAdapter = createAdapter(
    wallets,
    seedWallets,
    adapterManager,
    isCapacitor
  );
  const appKitConfig = buildAppKitConfig(newAdapter);
  const appKit = createAppKit(appKitConfig);
  appKit.setEIP6963Enabled(false);

  return {
    adapter: newAdapter,
  };
}

/**
 * Builds the AppKit configuration object
 */
function buildAppKitConfig(adapter: WagmiAdapter) {
  return {
    adapters: [adapter],
    networks: [mainnet] as [AppKitNetwork, ...AppKitNetwork[]],
    projectId: CW_PROJECT_ID,
    metadata: {
      name: "6529.io",
      description: "6529.io",
      url: publicEnv.BASE_ENDPOINT,
      icons: [
        "https://d3lqz0a4bldqgf.cloudfront.net/seize_images/Seize_Logo_Glasses_3.png",
      ],
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
