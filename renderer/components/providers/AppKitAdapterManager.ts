import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { CW_PROJECT_ID } from "@/constants/constants";
import { isElectron } from "@/helpers";
import type { ISeedWallet } from "@/shared/types";
import {
  AdapterCacheError,
  AdapterCleanupError,
  AdapterError,
} from "@/src/errors/adapter";
import {
  WalletSecurityError,
  WalletValidationError,
} from "@/src/errors/wallet-validation";
import { validateWalletSafely } from "@/utils/wallet-validation.utils";
import { browserConnector } from "@/wagmiConfig/browserConnector";
import { seedWalletConnector } from "@/wagmiConfig/seedWalletConnector";
import { createAppWalletConnector } from "@/wagmiConfig/wagmiAppWalletConnector";
import type { Chain } from "viem";
import { mainnet } from "viem/chains";
import type { CreateConnectorFn } from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import type { AppWallet } from "../app-wallets/AppWalletsContext";

type ConnectionState = "connecting" | "connected" | "disconnected";

export class AppKitAdapterManager {
  private currentAdapter: WagmiAdapter | null = null;
  private currentWallets: AppWallet[] = [];
  private currentChains: Chain[] = [];
  private readonly requestPassword: (
    address: string,
    addressHashed: string
  ) => Promise<string>;
  private readonly adapterCache = new Map<string, WagmiAdapter>();
  private readonly maxCacheSize = 5;
  private readonly connectionStates = new Map<string, ConnectionState>();

  constructor(
    requestPassword: (address: string, addressHashed: string) => Promise<string>
  ) {
    if (!requestPassword) {
      throw new AdapterError(
        "ADAPTER_005: requestPassword function is required"
      );
    }
    if (typeof requestPassword !== "function") {
      throw new AdapterError("ADAPTER_006: requestPassword must be a function");
    }
    this.requestPassword = requestPassword;
  }

  createAdapter(
    appWallets: AppWallet[],
    seedWalletsOrIsCapacitor: ISeedWallet[] | boolean = [],
    isCapacitorOrChains: boolean | Chain[] = false,
    maybeChains: Chain[] = [mainnet]
  ): WagmiAdapter {
    const { seedWallets, isCapacitor, chains } = this.resolveAdapterOptions(
      seedWalletsOrIsCapacitor,
      isCapacitorOrChains,
      maybeChains
    );

    if (!Array.isArray(appWallets)) {
      throw new AdapterError("ADAPTER_007: appWallets must be an array");
    }

    const appWalletConnectors = appWallets.map((wallet) => {
      if (!wallet) {
        throw new AdapterError(
          "ADAPTER_008: Invalid wallet object found in appWallets array"
        );
      }

      try {
        validateWalletSafely(wallet);

        return createAppWalletConnector(chains, { appWallet: wallet }, () =>
          this.requestPassword(wallet.address, wallet.address_hashed)
        );
      } catch (error) {
        if (
          error instanceof WalletValidationError ||
          error instanceof WalletSecurityError
        ) {
          console.error("Wallet validation failed during adapter creation:", {
            errorType: error.name,
            message: error.message,
          });
        }
        throw error;
      }
    });

    const connectors: CreateConnectorFn[] = [...appWalletConnectors];

    if (isElectron()) {
      seedWallets.forEach((wallet) => {
        connectors.push(
          seedWalletConnector({
            address: wallet.address,
            name: wallet.name,
          })
        );
      });

      connectors.push(
        browserConnector({
          openUrlFn: (url: string) => {
            window.api.openExternalChrome(url);
          },
          name: "Chrome",
          id: "chrome",
          icon: "/chrome.svg",
        }),
        browserConnector({
          openUrlFn: (url: string) => {
            window.api.openExternalFirefox(url);
          },
          name: "Firefox",
          id: "firefox",
          icon: "/firefox.svg",
        }),
        browserConnector({
          openUrlFn: (url: string) => {
            window.api.openExternalBrave(url);
          },
          name: "Brave",
          id: "brave",
          icon: "/brave.svg",
        })
      );
    }

    if (isCapacitor) {
      connectors.push(this.buildCoinbaseV3MobileWallet());
    }

    const wagmiAdapter = new WagmiAdapter({
      networks: chains,
      projectId: CW_PROJECT_ID,
      ssr: false,
      connectors,
    });

    this.currentAdapter = wagmiAdapter;
    this.currentWallets = [...appWallets];
    this.currentChains = [...chains];

    return wagmiAdapter;
  }

  shouldRecreateAdapter(newWallets: AppWallet[], newChains?: Chain[]): boolean {
    this.validateShouldRecreateAdapterInputs(newWallets, newChains);

    if (!this.currentAdapter) return true;
    if (newWallets.length !== this.currentWallets.length) return true;
    if (this.haveChainsChanged(newChains)) return true;

    const currentAddresses = this.toWalletAddressSet(
      this.currentWallets,
      "ADAPTER_010: Invalid wallet in currentWallets array"
    );
    const newAddresses = this.toWalletAddressSet(
      newWallets,
      "ADAPTER_011: Invalid wallet in newWallets array"
    );

    return this.doAddressSetsDiffer(currentAddresses, newAddresses);
  }

  private validateShouldRecreateAdapterInputs(
    newWallets: AppWallet[],
    newChains?: Chain[]
  ): void {
    if (!Array.isArray(newWallets)) {
      throw new AdapterError("ADAPTER_009: newWallets must be an array");
    }
    if (
      newChains !== undefined &&
      (!Array.isArray(newChains) || newChains.length === 0)
    ) {
      throw new AdapterError("ADAPTER_021: chains must be a non-empty array");
    }
  }

  private haveChainsChanged(newChains?: Chain[]): boolean {
    if (!newChains) return false;

    const currentChainIds = this.getSortedChainIdentifiers(this.currentChains);
    const newChainIds = this.getSortedChainIdentifiers(newChains);
    if (currentChainIds.length !== newChainIds.length) return true;

    for (let i = 0; i < newChainIds.length; i++) {
      if (currentChainIds[i] !== newChainIds[i]) return true;
    }

    return false;
  }

  private toWalletAddressSet(
    wallets: AppWallet[],
    errorMessage: string
  ): Set<string> {
    return new Set(
      wallets.map((w) => {
        if (!w?.address) {
          throw new AdapterError(errorMessage);
        }
        return w.address;
      })
    );
  }

  private doAddressSetsDiffer(
    currentAddresses: Set<string>,
    newAddresses: Set<string>
  ): boolean {
    for (const addr of newAddresses) {
      if (!currentAddresses.has(addr)) return true;
    }

    for (const addr of currentAddresses) {
      if (!newAddresses.has(addr)) return true;
    }

    return false;
  }

  createAdapterWithCache(
    appWallets: AppWallet[],
    seedWalletsOrIsCapacitor: ISeedWallet[] | boolean = [],
    isCapacitorOrChains: boolean | Chain[] = false,
    maybeChains: Chain[] = [mainnet]
  ): WagmiAdapter {
    const { seedWallets, isCapacitor, chains } = this.resolveAdapterOptions(
      seedWalletsOrIsCapacitor,
      isCapacitorOrChains,
      maybeChains
    );

    if (!Array.isArray(chains) || chains.length === 0) {
      throw new AdapterError("ADAPTER_021: chains must be a non-empty array");
    }
    if (!Array.isArray(appWallets)) {
      throw new AdapterError("ADAPTER_012: appWallets must be an array");
    }

    const cacheKey = this.getCacheKey(
      appWallets,
      seedWallets,
      chains,
      isCapacitor
    );

    if (this.adapterCache.has(cacheKey)) {
      const cachedAdapter = this.adapterCache.get(cacheKey);
      if (!cachedAdapter) {
        throw new AdapterCacheError(
          "CACHE_001: Cached adapter is null or undefined"
        );
      }
      this.currentAdapter = cachedAdapter;
      this.currentWallets = [...appWallets];
      this.currentChains = [...chains];
      return cachedAdapter;
    }

    const adapter = this.createAdapter(
      appWallets,
      seedWallets,
      isCapacitor,
      chains
    );

    if (this.adapterCache.size >= this.maxCacheSize) {
      const firstKey = Array.from(this.adapterCache.keys())[0];
      if (firstKey) {
        const oldAdapter = this.adapterCache.get(firstKey);
        if (oldAdapter && oldAdapter !== this.currentAdapter) {
          this.performAdapterCleanup(oldAdapter, firstKey);
        }
        this.adapterCache.delete(firstKey);
      }
    }

    this.adapterCache.set(cacheKey, adapter);
    return adapter;
  }

  private performAdapterCleanup(adapter: WagmiAdapter, cacheKey: string): void {
    if (!adapter) {
      throw new AdapterCleanupError(
        "CLEANUP_001: Cannot cleanup null or undefined adapter"
      );
    }
    if (!cacheKey) {
      throw new AdapterCleanupError(
        "CLEANUP_002: Cannot cleanup adapter without cache key"
      );
    }

    try {
      if (adapter === this.currentAdapter) {
        throw new AdapterCleanupError(
          `CLEANUP_003: Cannot cleanup currently active adapter for key: ${cacheKey}`
        );
      }
    } catch (error) {
      throw new AdapterCleanupError(
        `CLEANUP_004: Failed to cleanup adapter for key ${cacheKey}`,
        error
      );
    }
  }

  private getCacheKey(
    wallets: AppWallet[],
    seedWallets: ISeedWallet[],
    chains: Chain[] = [mainnet],
    isCapacitor = false
  ): string {
    const allWallets = [...wallets, ...seedWallets];
    if (!Array.isArray(allWallets)) {
      throw new AdapterError(
        "ADAPTER_013: Cannot generate cache key: wallets must be an array"
      );
    }

    const addresses = allWallets.map((w) => {
      if (!w?.address) {
        throw new AdapterError(
          "ADAPTER_014: Cannot generate cache key: invalid wallet object"
        );
      }
      return w.address;
    });

    const sortedAddresses = addresses.toSorted((a, b) => a.localeCompare(b));
    const chainIdentifiers = this.getSortedChainIdentifiers(chains);

    const walletsKey =
      sortedAddresses.length === 0
        ? "empty-wallets"
        : sortedAddresses.join(",");
    return `${walletsKey}|chains:${chainIdentifiers.join(",")}|platform:${
      isCapacitor ? "capacitor" : "web"
    }`;
  }

  private getSortedChainIdentifiers(chains: Chain[]): string[] {
    if (!Array.isArray(chains) || chains.length === 0) {
      throw new AdapterError("ADAPTER_021: chains must be a non-empty array");
    }

    return chains
      .map((chain) => {
        if (!chain || typeof chain.id !== "number") {
          throw new AdapterError(
            "ADAPTER_022: each chain must be an object with a numeric id"
          );
        }
        return `${chain.id}`;
      })
      .toSorted((a, b) => a.localeCompare(b));
  }

  private resolveAdapterOptions(
    seedWalletsOrIsCapacitor: ISeedWallet[] | boolean,
    isCapacitorOrChains: boolean | Chain[],
    maybeChains: Chain[]
  ): {
    seedWallets: ISeedWallet[];
    isCapacitor: boolean;
    chains: Chain[];
  } {
    let seedWallets: ISeedWallet[] = [];
    let isCapacitor = false;
    let chains: Chain[] = [mainnet];

    if (Array.isArray(seedWalletsOrIsCapacitor)) {
      seedWallets = seedWalletsOrIsCapacitor;
      if (typeof isCapacitorOrChains === "boolean") {
        isCapacitor = isCapacitorOrChains;
        chains = maybeChains;
      } else {
        chains = isCapacitorOrChains;
      }
    } else {
      isCapacitor = seedWalletsOrIsCapacitor;
      if (Array.isArray(isCapacitorOrChains)) {
        chains = isCapacitorOrChains;
      } else {
        isCapacitor = isCapacitorOrChains;
        chains = maybeChains;
      }
    }

    if (!Array.isArray(chains) || chains.length === 0) {
      throw new AdapterError("ADAPTER_021: chains must be a non-empty array");
    }

    return { seedWallets, isCapacitor, chains };
  }

  private buildCoinbaseV3MobileWallet(): CreateConnectorFn {
    return coinbaseWallet({
      appName: "6529.io",
      appLogoUrl:
        "https://d3lqz0a4bldqgf.cloudfront.net/seize_images/Seize_Logo_Glasses_3.png",
      enableMobileWalletLink: true,
      version: "3",
    });
  }

  getCurrentAdapter(): WagmiAdapter | null {
    return this.currentAdapter;
  }

  getConnectionState(walletAddress: string): ConnectionState {
    if (!walletAddress) {
      throw new AdapterError("ADAPTER_015: walletAddress is required");
    }
    if (typeof walletAddress !== "string") {
      throw new AdapterError("ADAPTER_016: walletAddress must be a string");
    }

    const state = this.connectionStates.get(walletAddress);
    return state || "disconnected";
  }

  setConnectionState(walletAddress: string, state: ConnectionState): void {
    if (!walletAddress) {
      throw new AdapterError("ADAPTER_017: walletAddress is required");
    }
    if (typeof walletAddress !== "string") {
      throw new AdapterError("ADAPTER_018: walletAddress must be a string");
    }
    if (!state) {
      throw new AdapterError("ADAPTER_019: state is required");
    }
    if (!["connecting", "connected", "disconnected"].includes(state)) {
      throw new AdapterError(
        `ADAPTER_020: Invalid state: ${state}. Must be 'connecting', 'connected', or 'disconnected'`
      );
    }

    this.connectionStates.set(walletAddress, state);
  }

  cleanup(): void {
    try {
      this.currentAdapter = null;
      this.currentWallets = [];
      this.currentChains = [];
      this.connectionStates.clear();

      const cacheEntries = Array.from(this.adapterCache.entries());
      const cleanupErrors: Array<{ key: string; error: unknown }> = [];

      for (const [key, adapter] of cacheEntries) {
        try {
          this.performAdapterCleanup(adapter, key);
        } catch (error) {
          cleanupErrors.push({ key, error });
        }
      }

      this.adapterCache.clear();

      if (cleanupErrors.length > 0) {
        const errorMessages = cleanupErrors.map(
          ({ key, error }) =>
            `Key: ${key}, Error: ${
              error instanceof Error ? error.message : String(error)
            }`
        );
        throw new AdapterCleanupError(
          `CLEANUP_005: Failed to cleanup ${
            cleanupErrors.length
          } adapter(s): ${errorMessages.join("; ")}`
        );
      }
    } catch (error) {
      if (error instanceof AdapterCleanupError) {
        throw error;
      }
      throw new AdapterCleanupError(
        "CLEANUP_006: Unexpected error during cleanup",
        error
      );
    }
  }
}
