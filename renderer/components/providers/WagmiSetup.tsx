"use client";

import { getSeedWallets } from "@/electron";
import { isElectron } from "@/helpers";
import { useAppWalletPasswordModal } from "@/hooks/useAppWalletPasswordModal";
import type { ISeedWallet } from "@/shared/types";
import { AppKitValidationError } from "@/src/errors/appkit-initialization";
import type { AppKitInitializationConfig } from "@/utils/appkit-initialization.utils";
import { initializeAppKit } from "@/utils/appkit-initialization.utils";
import {
  logErrorSecurely,
  sanitizeErrorForUser,
} from "@/utils/error-sanitizer";
import {
  SEED_WALLET_CONNECTOR_TYPE,
  seedWalletConnector,
} from "@/wagmiConfig/seedWalletConnector";
import {
  APP_WALLET_CONNECTOR_TYPE,
  createAppWalletConnector,
} from "@/wagmiConfig/wagmiAppWalletConnector";
import type { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Chain } from "viem";
import { mainnet, sepolia } from "viem/chains";
import { WagmiProvider } from "wagmi";
import type { AppWallet } from "@/components/app-wallets/AppWalletsContext";
import { useAppWallets } from "@/components/app-wallets/AppWalletsContext";
import { useAuth } from "@/components/auth/Auth";
import { AppKitAdapterManager } from "@/components/providers/AppKitAdapterManager";
import { publicEnv } from "@/config/env";

function installSafeEthereumProxy(): void {
  if (globalThis.window === undefined) return;

  const w = globalThis as unknown as {
    ethereum?: unknown | undefined;
    __6529_safeEthereumProxyInstalled?: boolean | undefined;
  };

  if (w.__6529_safeEthereumProxyInstalled) return;

  const ethereum = w.ethereum;
  if (
    !ethereum ||
    (typeof ethereum !== "object" && typeof ethereum !== "function")
  ) {
    w.__6529_safeEthereumProxyInstalled = true;
    return;
  }

  const ownEthereumDescriptor = Object.getOwnPropertyDescriptor(w, "ethereum");
  if (
    ownEthereumDescriptor?.configurable === false &&
    !canAssignProperty(ownEthereumDescriptor)
  ) {
    logErrorSecurely(
      "[WagmiSetup] Skipping safe ethereum proxy install for read-only window.ethereum",
      new Error("window.ethereum cannot be reassigned")
    );
    w.__6529_safeEthereumProxyInstalled = true;
    return;
  }

  try {
    let hasLoggedProxyGetError = false;
    const proxy = new Proxy(ethereum, {
      get(target, prop) {
        try {
          const value = Reflect.get(target, prop);
          if (typeof value === "function") {
            return value.bind(target);
          }
          return value;
        } catch (error) {
          if (!hasLoggedProxyGetError) {
            hasLoggedProxyGetError = true;
            const propLabel =
              typeof prop === "symbol" ? prop.toString() : String(prop);
            logErrorSecurely(
              `[WagmiSetup] ethereum proxy getter failed (prop: ${propLabel})`,
              error
            );
          }
          return undefined;
        }
      },
    });

    if (ownEthereumDescriptor?.configurable === false) {
      w.ethereum = proxy;
    } else {
      Object.defineProperty(w, "ethereum", {
        configurable: true,
        enumerable: ownEthereumDescriptor?.enumerable ?? true,
        writable: true,
        value: proxy,
      });
    }
    w.__6529_safeEthereumProxyInstalled = true;
  } catch (error) {
    logErrorSecurely(
      "[WagmiSetup] Failed to install safe ethereum proxy",
      error
    );
    w.__6529_safeEthereumProxyInstalled = true;
  }
}

function canAssignProperty(descriptor: PropertyDescriptor): boolean {
  if ("get" in descriptor || "set" in descriptor) {
    return typeof descriptor.set === "function";
  }

  return descriptor.writable !== false;
}

export default function WagmiSetup({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const enableTestnet = publicEnv.DROP_FORGE_TESTNET === true;

  const appWalletPasswordModal = useAppWalletPasswordModal();
  const { setToast } = useAuth();
  const { appWallets } = useAppWallets();

  const [currentAdapter, setCurrentAdapter] = useState<WagmiAdapter | null>(
    null
  );
  const [isMounted, setIsMounted] = useState(false);
  const processedWallets = useRef<Set<string>>(new Set());
  const isCapacitor = false;

  const adapterManager = useMemo(
    () => new AppKitAdapterManager(appWalletPasswordModal.requestPassword),
    [appWalletPasswordModal.requestPassword]
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [isInitializing, setIsInitializing] = useState(false);

  const initializeAppKitWithWallets = useCallback(
    (wallets: AppWallet[], seedWallets: ISeedWallet[]) => {
      if (!adapterManager) {
        throw new AppKitValidationError("Internal API failed");
      }

      const chains: Chain[] = [mainnet];
      if (enableTestnet) {
        chains.push(sepolia);
      }

      const config: AppKitInitializationConfig = {
        wallets,
        seedWallets,
        adapterManager: adapterManager as AppKitAdapterManager,
        isCapacitor,
        chains,
      };

      return initializeAppKit(config);
    },
    [adapterManager, isCapacitor, enableTestnet]
  );

  const setupAppKitAdapter = useCallback(
    async (wallets: AppWallet[], seedWallets: ISeedWallet[]) => {
      if (isInitializing) {
        throw new AppKitValidationError("Internal API failed");
      }

      setIsInitializing(true);

      try {
        const result = initializeAppKitWithWallets(wallets, seedWallets);
        await (result.ready ?? Promise.resolve());
        setCurrentAdapter(result.adapter);
      } catch (error) {
        logErrorSecurely("[WagmiSetup] AppKit initialization failed", error);
        const userMessage = sanitizeErrorForUser(error);
        setToast({
          message: userMessage,
          type: "error",
        });
        throw error;
      } finally {
        setIsInitializing(false);
      }
    },
    [isInitializing, initializeAppKitWithWallets, setToast]
  );

  useEffect(() => {
    if (isMounted && !currentAdapter && !isInitializing) {
      installSafeEthereumProxy();
      (async () => {
        const response = isElectron()
          ? await getSeedWallets()
          : { data: [] as ISeedWallet[] };
        const seedWallets = Array.isArray(response.data) ? response.data : [];
        setupAppKitAdapter([], seedWallets).catch(() => undefined);
      })();
    }
  }, [isMounted, currentAdapter, isInitializing]);

  useEffect(() => {
    if (!currentAdapter) return;

    const currentAddresses = new Set(appWallets.map((w) => w.address));
    const addressesEqual =
      processedWallets.current.size === currentAddresses.size &&
      Array.from(processedWallets.current).every((addr) =>
        currentAddresses.has(addr)
      );

    if (addressesEqual) return;

    try {
      const connectors = appWallets
        .map((wallet) => {
          const connector = createAppWalletConnector(
            Array.from(currentAdapter.wagmiConfig.chains),
            { appWallet: wallet },
            () =>
              appWalletPasswordModal.requestPassword(
                wallet.address,
                wallet.address_hashed
              )
          );
          return currentAdapter.wagmiConfig._internal.connectors.setup(
            connector
          );
        })
        .filter((connector) => connector !== null);

      const existingConnectors = currentAdapter.wagmiConfig.connectors.filter(
        (c) => c.id !== APP_WALLET_CONNECTOR_TYPE
      );

      currentAdapter.wagmiConfig._internal.connectors.setState([
        ...connectors,
        ...existingConnectors,
      ]);

      processedWallets.current = currentAddresses;
    } catch (error) {
      logErrorSecurely("[WagmiSetup] Connector injection failed", error);
      const userMessage = sanitizeErrorForUser(error);
      setToast({
        message: userMessage,
        type: "error",
      });
    }
  }, [currentAdapter, appWallets, appWalletPasswordModal, setToast]);

  useEffect(() => {
    const updateWagmiConfig = async () => {
      if (!currentAdapter) return;
      if (!isElectron()) return;

      const response = await getSeedWallets();
      const newSeedWallets = Array.isArray(response.data) ? response.data : [];
      const newSeedConnectors = newSeedWallets.map((wallet) => {
        const connector = seedWalletConnector({
          address: wallet.address,
          name: wallet.name,
        });
        return currentAdapter.wagmiConfig._internal.connectors.setup(connector);
      });
      const existingNonSeedConnectors =
        currentAdapter.wagmiConfig.connectors.filter(
          (c) => c.type !== SEED_WALLET_CONNECTOR_TYPE
        );

      currentAdapter.wagmiConfig._internal.connectors.setState([
        ...existingNonSeedConnectors,
        ...newSeedConnectors,
      ]);
    };

    window.api?.onSeedWalletsChange(updateWagmiConfig);

    return () => {
      window.api?.offSeedWalletsChange(updateWagmiConfig);
    };
  }, [currentAdapter]);

  if (!isMounted || !currentAdapter) {
    return null;
  }

  return (
    <WagmiProvider config={currentAdapter.wagmiConfig}>
      {children}
      {appWalletPasswordModal.modal}
    </WagmiProvider>
  );
}
