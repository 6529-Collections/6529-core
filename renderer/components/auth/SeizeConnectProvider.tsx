"use client";

import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAddress, isAddress } from "viem";
import { useAccount, useConnectors } from "wagmi";
import { MAX_CONNECTED_PROFILES } from "@/constants/constants";
import {
  SeizeConnectModal,
  useSeizeConnectModal,
} from "@/contexts/SeizeConnectModalContext";
import { isElectron } from "@/helpers";
import {
  canStoreAnotherWalletAccount,
  clearAgentLoginActiveAddress,
  type ConnectedWalletAccount,
  getConnectedWalletAccounts,
  getWalletAddress,
  isAuthAddressAuthorized,
  removeAuthJwt,
  setActiveWalletAccount,
} from "@/services/auth/auth.utils";
import { logoutSessionV2 } from "@/services/auth/session-v2.utils";
import { useConnectedAccountsUnreadNotifications } from "@/hooks/useConnectedAccountsUnreadNotifications";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import useCapacitor from "@/hooks/useCapacitor";
import { useAppKitBootstrap } from "@/components/providers/AppKitBootstrapContext";
import { SecurityEventType } from "@/types/security";
import {
  createConnectionEventContext,
  createValidationEventContext,
  logError,
  logSecurityEvent,
} from "@/utils/security-logger";
import { APP_WALLET_CONNECTOR_TYPE } from "@/wagmiConfig/wagmiAppWalletConnector";
import { SEED_WALLET_CONNECTOR_TYPE } from "@/wagmiConfig/seedWalletConnector";
import {
  BROWSER_CONNECTOR_CONNECTION_CHANGED_EVENT,
  clearBrowserConnectorConnectIntent,
  setBrowserConnectorConnectIntent,
  type BrowserConnectorConnectIntent,
} from "@/wagmiConfig/browserConnector";
import {
  AppKitModalBridge,
  createAppKitModalBridgeStore,
  useAppKitModalBridgeState,
} from "./AppKitModalBridge";
import { openDesktopAddConnectorChooser } from "./connector-selection-lifecycle";
import { WalletErrorBoundary } from "./error-boundary";
import { SeizeConnectContext } from "./seizeConnectContextValue";
import {
  AuthenticationError,
  createWalletError,
  WalletConnectionError,
  WalletDisconnectionError,
} from "./seizeConnectErrors";
import { useSeizeConnectProviderEffects } from "./seizeConnectEffects";
import { selectLiveWalletAccount } from "./selectLiveWalletAccount";
import type { SeizeConnectContextType } from "./seizeConnectTypes";
import {
  CONNECT_AFTER_DISCONNECT_DELAY_MS,
  CONNECT_INTENT_HANDOFF_GRACE_MS,
  normalizeAddress,
  useConsolidatedWalletState,
} from "./seizeConnectWalletState";
import { getSeizeConnectImpersonation } from "./seizeConnectImpersonation";
import { useAddConnectedAccount } from "./useAddConnectedAccount";
import { useSignOutAllTransaction } from "./useSignOutAllTransaction";
import CapacitorConnectFlow from "./CapacitorConnectFlow";
import type { CapacitorConnectDialogView } from "./CapacitorConnectDialog";
import {
  openFreshUserConnection,
  openUserConnectionSurfaceForRuntime,
  useDisconnectExternalWalletBeforeSelection,
} from "./capacitorConnectController";

export const SeizeConnectProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const appKitAccount = useAppKitAccount();
  const wagmiAccount = useAccount();
  const wagmiConnectors = useConnectors();
  const { disconnect } = useDisconnect();
  const capacitor = useCapacitor();
  const { showConnectModal, setShowConnectModal } = useSeizeConnectModal();
  const {
    hasTerminalError: hasTerminalBootstrapError,
    isCreated: isAppKitCreated,
    isReady: isAppKitReady,
    status: appKitBootstrapStatus,
    waitForReady: waitForAppKitReady,
  } = useAppKitBootstrap();
  const appKitModalBridgeStore = useMemo(createAppKitModalBridgeStore, []);
  const appKitModalState = useAppKitModalBridgeState(appKitModalBridgeStore);
  const isConnectModalOpen = appKitModalState.isOpen || showConnectModal;
  const [storedConnectedAccounts, setStoredConnectedAccounts] = useState<
    ConnectedWalletAccount[]
  >(() => getConnectedWalletAccounts());
  const [isAddingConnectedAccount, setIsAddingConnectedAccount] =
    useState(false);
  const [
    browserConnectorConnectedAddress,
    setBrowserConnectorConnectedAddress,
  ] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConnectIntentWaitingForAppKit, setIsConnectIntentWaitingForAppKit] =
    useState(false);
  const [capacitorConnectView, setCapacitorConnectView] =
    useState<CapacitorConnectDialogView>("closed");
  const [isCapacitorHandoffPending, setIsCapacitorHandoffPending] =
    useState(false);

  // Use consolidated wallet state management
  const {
    walletState,
    connectedAddress,
    setConnecting,
    setConnected,
    setDisconnected,
    hasInitializationError,
    initializationError,
    isInitialized,
  } = useConsolidatedWalletState();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const addFlowOriginAddressRef = useRef<string | null>(null);
  const retryConnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectIntentHandoffTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAddingConnectedAccountRef = useRef(false);
  const isBrowserConnectorHandoffRef = useRef(false);
  const isMountedRef = useRef(true);
  const { agentLoginImpersonatedAddress, impersonatedAddress } =
    getSeizeConnectImpersonation();

  const activeStoredAddress = getWalletAddress();
  const liveAccount = useMemo(
    () =>
      selectLiveWalletAccount({
        activeStoredAddress,
        appKitAccount: {
          address: appKitAccount.address,
          isConnected: appKitAccount.isConnected,
          status: appKitAccount.status,
        },
        browserConnectorConnectedAddress,
        wagmiAccount: {
          address: wagmiAccount.address,
          isConnected: wagmiAccount.isConnected,
          status: wagmiAccount.status,
        },
      }),
    [
      activeStoredAddress,
      appKitAccount.address,
      appKitAccount.isConnected,
      appKitAccount.status,
      browserConnectorConnectedAddress,
      wagmiAccount.address,
      wagmiAccount.isConnected,
      wagmiAccount.status,
    ]
  );

  const refreshStoredConnectedAccounts = useCallback(() => {
    setStoredConnectedAccounts(getConnectedWalletAccounts());
  }, []);

  const {
    getSignOutAllGeneration,
    hasSignOutAllGenerationChanged,
    isSigningOutAll,
    isSigningOutAllRef,
    seizeDisconnectAndLogoutAll,
  } = useSignOutAllTransaction({
    disconnect,
    isMountedRef,
    refreshStoredConnectedAccounts,
    setDisconnected,
  });

  useEffect(() => {
    if (!isSigningOutAll) {
      return;
    }
    if (retryConnectTimeoutRef.current) {
      clearTimeout(retryConnectTimeoutRef.current);
      retryConnectTimeoutRef.current = null;
    }
    isAddingConnectedAccountRef.current = false;
    isBrowserConnectorHandoffRef.current = false;
    addFlowOriginAddressRef.current = null;
    setIsAddingConnectedAccount(false);
    clearBrowserConnectorConnectIntent();
    setShowConnectModal(false);
  }, [isSigningOutAll, setShowConnectModal]);

  useEffect(() => {
    if (globalThis.window === undefined) {
      return;
    }

    const handleBrowserConnectorConnectionChanged = (event: Event): void => {
      const nextAddress = (event as CustomEvent<{ address?: string | null }>)
        .detail?.address;

      refreshStoredConnectedAccounts();
      const checksummedAddress =
        typeof nextAddress === "string" && isAddress(nextAddress)
          ? getAddress(nextAddress)
          : null;
      setBrowserConnectorConnectedAddress(checksummedAddress);

      const storedAddress = getWalletAddress();
      if (
        checksummedAddress &&
        storedAddress &&
        normalizeAddress(checksummedAddress) === normalizeAddress(storedAddress)
      ) {
        setConnected(checksummedAddress);
      }
    };

    globalThis.window.addEventListener(
      BROWSER_CONNECTOR_CONNECTION_CHANGED_EVENT,
      handleBrowserConnectorConnectionChanged as EventListener
    );

    return () => {
      globalThis.window.removeEventListener(
        BROWSER_CONNECTOR_CONNECTION_CHANGED_EVENT,
        handleBrowserConnectorConnectionChanged as EventListener
      );
    };
  }, [refreshStoredConnectedAccounts, setConnected]);

  const clearConnectIntentHandoffTimeout = useCallback((): void => {
    if (connectIntentHandoffTimeoutRef.current) {
      clearTimeout(connectIntentHandoffTimeoutRef.current);
      connectIntentHandoffTimeoutRef.current = null;
    }
  }, []);

  const clearConnectIntentWaitingForAppKit = useCallback((): void => {
    clearConnectIntentHandoffTimeout();
    if (isMountedRef.current) {
      setIsConnectIntentWaitingForAppKit(false);
    }
  }, [clearConnectIntentHandoffTimeout]);

  useEffect(() => {
    if (appKitBootstrapStatus === "error" && hasTerminalBootstrapError) {
      appKitModalBridgeStore.failBootstrap();
    }
  }, [
    appKitBootstrapStatus,
    appKitModalBridgeStore,
    hasTerminalBootstrapError,
  ]);

  useEffect(
    () => () => {
      appKitModalBridgeStore.dispose();
    },
    [appKitModalBridgeStore]
  );

  const scheduleConnectIntentHandoffFallback = useCallback((): void => {
    clearConnectIntentHandoffTimeout();
    connectIntentHandoffTimeoutRef.current = setTimeout(() => {
      connectIntentHandoffTimeoutRef.current = null;
      if (isMountedRef.current) {
        setIsConnectIntentWaitingForAppKit(false);
      }
    }, CONNECT_INTENT_HANDOFF_GRACE_MS);
  }, [clearConnectIntentHandoffTimeout]);

  useSeizeConnectProviderEffects({
    account: liveAccount,
    addFlowOriginAddressRef,
    agentLoginImpersonatedAddress,
    clearConnectIntentHandoffTimeout,
    clearConnectIntentWaitingForAppKit,
    debounceTimeoutRef,
    impersonatedAddress,
    isAddingConnectedAccount,
    isAddingConnectedAccountRef,
    isBrowserConnectorHandoffRef,
    isConnectIntentWaitingForAppKit,
    isInitialized,
    isSigningOutAll,
    isSigningOutAllRef,
    isMountedRef,
    refreshStoredConnectedAccounts,
    retryConnectTimeoutRef,
    setConnected,
    setConnecting,
    setDisconnected,
    setIsAddingConnectedAccount,
    setIsConnectIntentWaitingForAppKit,
    stateOpen:
      isConnectModalOpen ||
      capacitorConnectView !== "closed" ||
      isCapacitorHandoffPending,
    storedConnectedAccounts,
    walletState,
  });

  const activeAddress = impersonatedAddress ?? connectedAddress;
  const liveConnectedAddress =
    impersonatedAddress ||
    (liveAccount.address &&
    liveAccount.isConnected &&
    isAddress(liveAccount.address)
      ? getAddress(liveAccount.address)
      : undefined);
  const isActiveWalletConnected = !!(
    activeAddress &&
    liveConnectedAddress &&
    normalizeAddress(activeAddress) === normalizeAddress(liveConnectedAddress)
  );
  const activeConnectorType = wagmiAccount.connector?.type;
  const isActiveAppWalletConnector =
    activeConnectorType === APP_WALLET_CONNECTOR_TYPE;
  // Prefer the live provider identity when storage and Wagmi are briefly out
  // of sync; fall back to the authenticated address during reconnect.
  const connectorIdentityAddress = liveConnectedAddress ?? activeAddress;
  const hasMatchingSeedWalletConnector = !!(
    connectorIdentityAddress &&
    wagmiConnectors.some(
      (connector) =>
        connector.type === SEED_WALLET_CONNECTOR_TYPE &&
        isAddress(connector.id) &&
        normalizeAddress(connector.id) ===
          normalizeAddress(connectorIdentityAddress)
    )
  );
  const isActiveLocalWalletConnector =
    activeConnectorType === APP_WALLET_CONNECTOR_TYPE ||
    activeConnectorType === SEED_WALLET_CONNECTOR_TYPE ||
    hasMatchingSeedWalletConnector;

  const openConnectModal = useCallback(
    async (
      source: string,
      view: "Connect" | "AllWallets" = "Connect"
    ): Promise<void> => {
      if (isSigningOutAllRef.current) {
        return;
      }
      const signOutGeneration = getSignOutAllGeneration();
      try {
        clearConnectIntentHandoffTimeout();

        // Electron renders its own connector chooser and does not need AppKit's
        // modal runtime to be ready. Opening it synchronously avoids a transient
        // AppKit bootstrap state turning an Add click into a silent no-op.
        if (isElectron()) {
          setIsConnectIntentWaitingForAppKit(false);
          setShowConnectModal(true);
          logSecurityEvent(
            SecurityEventType.WALLET_MODAL_OPENED,
            createConnectionEventContext(source)
          );
          scheduleConnectIntentHandoffFallback();
          return;
        }

        setIsConnectIntentWaitingForAppKit(true);
        if (!isAppKitReady) {
          await waitForAppKitReady();
        }

        if (
          !isMountedRef.current ||
          hasSignOutAllGenerationChanged(signOutGeneration)
        ) {
          clearConnectIntentWaitingForAppKit();
          return;
        }

        const openAppKit = await appKitModalBridgeStore.waitForOpen();
        if (hasSignOutAllGenerationChanged(signOutGeneration)) {
          clearConnectIntentWaitingForAppKit();
          return;
        }
        await openAppKit({ view });

        if (hasSignOutAllGenerationChanged(signOutGeneration)) {
          clearConnectIntentWaitingForAppKit();
          await appKitModalBridgeStore.close();
          return;
        }

        logSecurityEvent(
          SecurityEventType.WALLET_MODAL_OPENED,
          createConnectionEventContext(source)
        );
        scheduleConnectIntentHandoffFallback();
      } catch (error) {
        clearConnectIntentWaitingForAppKit();
        const connectionError = new WalletConnectionError(
          "Failed to open wallet connection modal",
          error
        );
        logError(source, connectionError);
        throw connectionError;
      }
    },
    [
      clearConnectIntentHandoffTimeout,
      clearConnectIntentWaitingForAppKit,
      getSignOutAllGeneration,
      hasSignOutAllGenerationChanged,
      appKitModalBridgeStore,
      isAppKitReady,
      isSigningOutAllRef,
      scheduleConnectIntentHandoffFallback,
      setShowConnectModal,
      waitForAppKitReady,
    ]
  );

  const openExternalWallets = useCallback(
    () => openConnectModal("capacitorExternalWallets", "AllWallets"),
    [openConnectModal]
  );

  const seizeConnectOrThrow = useCallback(
    async (
      source: string,
      intent?: BrowserConnectorConnectIntent
    ): Promise<void> => {
      if (isSigningOutAllRef.current) {
        return;
      }
      if (intent) {
        setBrowserConnectorConnectIntent(intent);
      } else {
        clearBrowserConnectorConnectIntent();
      }

      // Log connection attempt for security monitoring
      logSecurityEvent(
        SecurityEventType.WALLET_CONNECTION_ATTEMPT,
        createConnectionEventContext(source)
      );

      try {
        await openConnectModal(source);
      } catch (error) {
        clearBrowserConnectorConnectIntent();
        throw error;
      }
    },
    [isSigningOutAllRef, openConnectModal]
  );

  const seizeConnect = useCallback((): void => {
    seizeConnectOrThrow("seizeConnect").then(undefined, () => undefined);
  }, [seizeConnectOrThrow]);

  const handleAddConnectedAccountConnectFailure = useCallback(
    (clearAddConnectedAccountGuard: () => void, error: unknown): void => {
      clearAddConnectedAccountGuard();
      setIsAddingConnectedAccount(false);
      const connectionError = createWalletError(
        WalletConnectionError,
        "start add-account connection flow",
        error
      );
      logError("seizeAddConnectedAccount", connectionError);
    },
    []
  );

  const getActiveConnectIntent = useCallback(():
    | BrowserConnectorConnectIntent
    | undefined => {
    const walletAddress =
      activeAddress && isAddress(activeAddress)
        ? activeAddress
        : getWalletAddress();
    if (!walletAddress || !isAddress(walletAddress)) {
      return undefined;
    }

    return { intendedWalletAddress: getAddress(walletAddress) };
  }, [activeAddress]);

  const getAddAccountConnectIntent = useCallback(
    (
      originAddress: string | null
    ): BrowserConnectorConnectIntent | undefined => {
      const fallbackOrigin =
        activeAddress && isAddress(activeAddress)
          ? getAddress(activeAddress)
          : null;
      const walletAddress = originAddress ?? fallbackOrigin;
      return walletAddress ? { originWalletAddress: walletAddress } : undefined;
    },
    [activeAddress]
  );

  const openUserConnectionSurface = useCallback(
    (source: string): Promise<void> =>
      openUserConnectionSurfaceForRuntime({
        source,
        isCapacitor: capacitor.isCapacitor,
        isSigningOutAll: isSigningOutAllRef.current,
        openWebConnection: (webSource) =>
          seizeConnectOrThrow(webSource, getActiveConnectIntent()),
        setCapacitorView: setCapacitorConnectView,
      }),
    [
      capacitor.isCapacitor,
      getActiveConnectIntent,
      isSigningOutAllRef,
      seizeConnectOrThrow,
    ]
  );

  const seizeConnectFresh = useCallback(async (): Promise<void> => {
    if (isSigningOutAllRef.current) {
      return;
    }
    const signOutGeneration = getSignOutAllGeneration();
    isAddingConnectedAccountRef.current = false;
    addFlowOriginAddressRef.current = null;
    setIsAddingConnectedAccount(false);
    if (retryConnectTimeoutRef.current) {
      clearTimeout(retryConnectTimeoutRef.current);
      retryConnectTimeoutRef.current = null;
    }

    const liveConnectedWallet =
      liveAccount.address &&
      liveAccount.isConnected &&
      isAddress(liveAccount.address)
        ? getAddress(liveAccount.address)
        : null;
    const connectIntent = getActiveConnectIntent();

    if (capacitor.isCapacitor) {
      await openFreshUserConnection({
        address: appKitAccount.address,
        isConnected: appKitAccount.isConnected,
        isCapacitor: true,
        isActiveAppWalletConnector,
        isSigningOutAll: isSigningOutAllRef.current,
        disconnect,
        getSignOutAllGeneration,
        hasSignOutAllGenerationChanged,
        isMounted: () => isMountedRef.current,
        openUserConnectionSurface,
      });
      return;
    }

    if (!liveConnectedWallet || isActiveLocalWalletConnector) {
      await seizeConnectOrThrow("seizeConnectFresh", connectIntent);
      return;
    }

    try {
      await disconnect();
    } catch (error: unknown) {
      const walletError = createWalletError(
        WalletDisconnectionError,
        "disconnect wallet before opening connection modal",
        error
      );
      logError("seizeConnectFresh", walletError);
      throw walletError;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, CONNECT_AFTER_DISCONNECT_DELAY_MS);
    });

    if (
      !isMountedRef.current ||
      hasSignOutAllGenerationChanged(signOutGeneration)
    ) {
      return;
    }

    await seizeConnectOrThrow("seizeConnectFresh", connectIntent);
  }, [
    appKitAccount.address,
    appKitAccount.isConnected,
    capacitor.isCapacitor,
    liveAccount.address,
    liveAccount.isConnected,
    disconnect,
    getActiveConnectIntent,
    getSignOutAllGeneration,
    hasSignOutAllGenerationChanged,
    isActiveAppWalletConnector,
    isActiveLocalWalletConnector,
    isSigningOutAllRef,
    openUserConnectionSurface,
    seizeConnectOrThrow,
  ]);

  const restoreStoredWalletState = useCallback((): void => {
    refreshStoredConnectedAccounts();
    const storedAddress = getWalletAddress();
    if (storedAddress && isAddress(storedAddress)) {
      setConnected(getAddress(storedAddress));
      return;
    }
    setDisconnected();
  }, [refreshStoredConnectedAccounts, setConnected, setDisconnected]);

  const seizeBeginBrowserConnectorHandoff = useCallback((): void => {
    isBrowserConnectorHandoffRef.current = true;
    isAddingConnectedAccountRef.current = false;
    addFlowOriginAddressRef.current = null;
    if (retryConnectTimeoutRef.current) {
      clearTimeout(retryConnectTimeoutRef.current);
      retryConnectTimeoutRef.current = null;
    }
    setIsAddingConnectedAccount(false);
  }, []);

  const seizeEndBrowserConnectorHandoff = useCallback((): void => {
    isBrowserConnectorHandoffRef.current = false;
    if (isSigningOutAllRef.current) {
      return;
    }
    restoreStoredWalletState();
  }, [isSigningOutAllRef, restoreStoredWalletState]);

  const seizeDisconnect = useCallback(async (): Promise<void> => {
    if (isSigningOutAllRef.current) {
      return;
    }
    const hasLiveProviderConnection = !!(
      liveAccount.address &&
      liveAccount.isConnected &&
      isAddress(liveAccount.address)
    );

    if (!hasLiveProviderConnection && !isActiveWalletConnected) {
      isAddingConnectedAccountRef.current = false;
      addFlowOriginAddressRef.current = null;
      setIsAddingConnectedAccount(false);
      restoreStoredWalletState();
      return;
    }

    setIsDisconnecting(true);
    try {
      await disconnect();
      isAddingConnectedAccountRef.current = false;
      addFlowOriginAddressRef.current = null;
      setIsAddingConnectedAccount(false);
      restoreStoredWalletState();
    } catch (error: unknown) {
      const walletError = createWalletError(
        WalletDisconnectionError,
        "disconnect wallet",
        error
      );
      logError("seizeDisconnect", walletError);
      throw walletError;
    } finally {
      setIsDisconnecting(false);
    }
  }, [
    liveAccount.address,
    liveAccount.isConnected,
    disconnect,
    isActiveWalletConnected,
    isSigningOutAllRef,
    restoreStoredWalletState,
  ]);

  const seizeDisconnectAndLogout = useCallback(async (): Promise<void> => {
    if (isSigningOutAllRef.current) {
      return;
    }
    setIsDisconnecting(true);
    try {
      // CRITICAL: Wallet disconnect MUST succeed before auth cleanup
      try {
        await disconnect();
      } catch (error: unknown) {
        const walletError = createWalletError(
          WalletDisconnectionError,
          "disconnect wallet during logout",
          error
        );
        logError("seizeDisconnectAndLogout", walletError);

        // SECURITY: Throw AuthenticationError to prevent auth bypass
        throw new AuthenticationError(
          "Cannot complete logout: wallet disconnection failed. User may still have active wallet connection.",
          walletError
        );
      }

      try {
        try {
          await logoutSessionV2({ address: getWalletAddress() });
        } catch (error: unknown) {
          const revokeError =
            error instanceof Error
              ? error
              : new Error("Failed to revoke session during logout");
          logError("seizeDisconnectAndLogout.logoutSessionV2", revokeError);
        }
        await removeAuthJwt();
        refreshStoredConnectedAccounts();

        const nextActiveAddress = getWalletAddress();
        if (nextActiveAddress && isAddress(nextActiveAddress)) {
          setConnected(getAddress(nextActiveAddress));
        } else {
          setDisconnected();
        }
      } catch (error: unknown) {
        const authError = new AuthenticationError(
          "Failed to revoke authentication state after successful wallet disconnect",
          error
        );
        logError("seizeDisconnectAndLogout", authError);
        throw authError;
      }
    } finally {
      setIsDisconnecting(false);
    }
  }, [
    disconnect,
    isSigningOutAllRef,
    refreshStoredConnectedAccounts,
    setConnected,
    setDisconnected,
  ]);

  const seizeAcceptConnection = useCallback(
    (address: string): void => {
      if (isSigningOutAllRef.current) {
        return;
      }
      // Extract diagnostic data before validation check
      const addressLength = address.length;
      const addressFormat = address.startsWith("0x") ? "hex_prefixed" : "other";

      if (!isAddress(address)) {
        // Log security event with NO address data
        logSecurityEvent(
          SecurityEventType.INVALID_ADDRESS_DETECTED,
          createValidationEventContext(
            "seizeAcceptConnection",
            false,
            addressLength,
            addressFormat
          )
        );

        const error = new AuthenticationError(
          "Invalid Ethereum address format. Address must be a valid EIP-55 checksummed format."
        );
        logError("seizeAcceptConnection", error);
        throw error;
      }

      // Log successful address validation with NO address data
      logSecurityEvent(
        SecurityEventType.ADDRESS_VALIDATION_SUCCESS,
        createValidationEventContext("seizeAcceptConnection", true)
      );

      // Normalize address to checksummed format for consistency
      const checksummedAddress = getAddress(address);
      clearAgentLoginActiveAddress();
      setConnected(checksummedAddress);
      refreshStoredConnectedAccounts();
    },
    [isSigningOutAllRef, refreshStoredConnectedAccounts, setConnected]
  );

  const seizeSwitchConnectedAccount = useCallback(
    (address: string): void => {
      if (isSigningOutAllRef.current) {
        return;
      }
      if (!isAddress(address)) {
        throw new AuthenticationError(
          "Cannot switch account: invalid Ethereum address format."
        );
      }

      const checksummedAddress = getAddress(address);
      if (
        activeAddress &&
        normalizeAddress(activeAddress) === normalizeAddress(checksummedAddress)
      ) {
        return;
      }

      const didSwitch = setActiveWalletAccount(checksummedAddress);
      if (!didSwitch) {
        throw new AuthenticationError(
          "Cannot switch account: requested account is not available."
        );
      }

      refreshStoredConnectedAccounts();
      setConnected(checksummedAddress);
    },
    [
      activeAddress,
      isSigningOutAllRef,
      refreshStoredConnectedAccounts,
      setConnected,
    ]
  );

  const canAddConnectedAccount =
    storedConnectedAccounts.length < MAX_CONNECTED_PROFILES;

  const openAddConnectedAccountModal = useCallback(
    (
      clearAddConnectedAccountGuard: () => void,
      originAddress: string | null,
      signOutGeneration: number
    ): void => {
      if (
        isSigningOutAllRef.current ||
        hasSignOutAllGenerationChanged(signOutGeneration)
      ) {
        clearAddConnectedAccountGuard();
        setIsAddingConnectedAccount(false);
        return;
      }
      seizeConnectOrThrow(
        "seizeAddConnectedAccount",
        getAddAccountConnectIntent(originAddress)
      ).catch((error: unknown) => {
        handleAddConnectedAccountConnectFailure(
          clearAddConnectedAccountGuard,
          error
        );
      });
    },
    [
      getAddAccountConnectIntent,
      hasSignOutAllGenerationChanged,
      handleAddConnectedAccountConnectFailure,
      isSigningOutAllRef,
      seizeConnectOrThrow,
    ]
  );

  const seizeAddConnectedAccount = useCallback((): void => {
    const clearAddConnectedAccountGuard = (): void => {
      isAddingConnectedAccountRef.current = false;
      addFlowOriginAddressRef.current = null;
      if (retryConnectTimeoutRef.current) {
        clearTimeout(retryConnectTimeoutRef.current);
        retryConnectTimeoutRef.current = null;
      }
    };

    if (
      isSigningOutAllRef.current ||
      !canAddConnectedAccount ||
      !canStoreAnotherWalletAccount()
    ) {
      return;
    }
    const signOutGeneration = getSignOutAllGeneration();

    // The desktop chooser can coexist with every connector. Opening Add must
    // never disconnect or activate a wallet before the user selects one.
    if (isElectron()) {
      const storedOrigin = getWalletAddress();
      const addFlowOriginWallet =
        storedOrigin && isAddress(storedOrigin)
          ? getAddress(storedOrigin)
          : null;
      openDesktopAddConnectorChooser({
        clearAddCandidate: clearAddConnectedAccountGuard,
        setAddingConnectedAccount: setIsAddingConnectedAccount,
        openChooser: () =>
          openAddConnectedAccountModal(
            clearAddConnectedAccountGuard,
            addFlowOriginWallet,
            signOutGeneration
          ),
      });
      return;
    }

    const liveConnectedWallet =
      liveAccount.address &&
      liveAccount.isConnected &&
      isAddress(liveAccount.address)
        ? getAddress(liveAccount.address)
        : null;
    const addFlowOriginWallet =
      liveConnectedWallet ??
      (activeAddress && isAddress(activeAddress)
        ? getAddress(activeAddress)
        : null);
    const addFlowOriginAddress = addFlowOriginAddressRef.current;
    const addFlowReturnedToOrigin =
      !isConnectModalOpen &&
      !isConnectIntentWaitingForAppKit &&
      !!liveConnectedWallet &&
      !!addFlowOriginAddress &&
      normalizeAddress(liveConnectedWallet) ===
        normalizeAddress(addFlowOriginAddress);
    const hasStaleAddConnectedAccountGuard =
      isAddingConnectedAccountRef.current &&
      (!isAddingConnectedAccount ||
        addFlowReturnedToOrigin ||
        (!isConnectModalOpen &&
          !isConnectIntentWaitingForAppKit &&
          !retryConnectTimeoutRef.current &&
          !liveConnectedWallet &&
          liveAccount.status !== "connecting" &&
          liveAccount.status !== "reconnecting"));

    if (hasStaleAddConnectedAccountGuard) {
      clearAddConnectedAccountGuard();
      setIsAddingConnectedAccount(false);
    }

    if (isAddingConnectedAccountRef.current) {
      return;
    }

    if (!liveConnectedWallet || isActiveLocalWalletConnector) {
      isAddingConnectedAccountRef.current = true;
      addFlowOriginAddressRef.current = addFlowOriginWallet;
      setIsAddingConnectedAccount(true);

      openAddConnectedAccountModal(
        clearAddConnectedAccountGuard,
        addFlowOriginWallet,
        signOutGeneration
      );
      return;
    }

    isAddingConnectedAccountRef.current = true;
    addFlowOriginAddressRef.current = liveConnectedWallet;
    setIsAddingConnectedAccount(true);

    if (retryConnectTimeoutRef.current) {
      clearTimeout(retryConnectTimeoutRef.current);
      retryConnectTimeoutRef.current = null;
    }

    try {
      disconnect()
        .then(() => {
          retryConnectTimeoutRef.current = setTimeout(() => {
            retryConnectTimeoutRef.current = null;
            if (!isMountedRef.current) {
              clearAddConnectedAccountGuard();
              return;
            }
            openAddConnectedAccountModal(
              clearAddConnectedAccountGuard,
              liveConnectedWallet,
              signOutGeneration
            );
          }, CONNECT_AFTER_DISCONNECT_DELAY_MS);
        })
        .catch((error: unknown) => {
          clearAddConnectedAccountGuard();
          setIsAddingConnectedAccount(false);
          const walletError = createWalletError(
            WalletDisconnectionError,
            "disconnect wallet before adding account",
            error
          );
          logError("seizeAddConnectedAccount", walletError);
        });
    } catch (error: unknown) {
      clearAddConnectedAccountGuard();
      setIsAddingConnectedAccount(false);
      const walletError = createWalletError(
        WalletDisconnectionError,
        "disconnect wallet before adding account",
        error
      );
      logError("seizeAddConnectedAccount", walletError);
    }
  }, [
    activeAddress,
    liveAccount.address,
    liveAccount.isConnected,
    liveAccount.status,
    canAddConnectedAccount,
    disconnect,
    getSignOutAllGeneration,
    isActiveLocalWalletConnector,
    isSigningOutAllRef,
    isAddingConnectedAccount,
    isConnectIntentWaitingForAppKit,
    isConnectModalOpen,
    openAddConnectedAccountModal,
  ]);

  const seizeAddConnectedAccountCapacitor = useAddConnectedAccount({
    account: appKitAccount,
    addFlowOriginAddressRef,
    appKitModalOpen:
      appKitModalState.isOpen ||
      capacitorConnectView !== "closed" ||
      isCapacitorHandoffPending,
    canAddConnectedAccount,
    disconnect,
    deferDisconnectUntilSelection: true,
    getSignOutAllGeneration,
    hasSignOutAllGenerationChanged,
    isActiveAppWalletConnector,
    isAddingConnectedAccount,
    isAddingConnectedAccountRef,
    isConnectIntentWaitingForAppKit,
    isMountedRef,
    isSigningOutAllRef,
    retryConnectTimeoutRef,
    seizeConnectOrThrow: openUserConnectionSurface,
    setIsAddingConnectedAccount,
  });

  const seizeAddConnectedAccountForRuntime = useCallback((): void => {
    if (capacitor.isCapacitor) {
      seizeAddConnectedAccountCapacitor();
      return;
    }
    seizeAddConnectedAccount();
  }, [
    capacitor.isCapacitor,
    seizeAddConnectedAccount,
    seizeAddConnectedAccountCapacitor,
  ]);

  const disconnectExternalWalletBeforeSelection =
    useDisconnectExternalWalletBeforeSelection({
      address: appKitAccount.address,
      isConnected: appKitAccount.isConnected,
      isActiveAppWalletConnector,
      disconnect,
    });

  const connectedAccounts = useMemo(() => {
    if (isSigningOutAll) {
      return [];
    }
    const browserConnectorAddress =
      browserConnectorConnectedAddress &&
      isAddress(browserConnectorConnectedAddress)
        ? getAddress(browserConnectorConnectedAddress)
        : null;

    return storedConnectedAccounts.map((storedAccount) => {
      const isActive =
        !!activeAddress &&
        normalizeAddress(storedAccount.address) ===
          normalizeAddress(activeAddress);
      const isConnectedForAccount = !!(
        (liveConnectedAddress &&
          normalizeAddress(storedAccount.address) ===
            normalizeAddress(liveConnectedAddress)) ||
        (browserConnectorAddress &&
          normalizeAddress(storedAccount.address) ===
            normalizeAddress(browserConnectorAddress))
      );

      return {
        address: storedAccount.address,
        role: storedAccount.role,
        profileId: storedAccount.profileId,
        profileHandle: storedAccount.profileHandle,
        isActive,
        isConnected: isConnectedForAccount,
      };
    });
  }, [
    activeAddress,
    browserConnectorConnectedAddress,
    isSigningOutAll,
    liveConnectedAddress,
    storedConnectedAccounts,
  ]);

  const activeStoredAccount = useMemo(() => {
    if (!activeAddress || isSigningOutAll) {
      return null;
    }

    return (
      storedConnectedAccounts.find(
        (storedAccount) =>
          normalizeAddress(storedAccount.address) ===
          normalizeAddress(activeAddress)
      ) ?? null
    );
  }, [activeAddress, isSigningOutAll, storedConnectedAccounts]);

  const hasActiveWalletAddress = !isSigningOutAll && !!activeAddress;
  const hasValidWalletAuth = useMemo(
    () =>
      !isSigningOutAll &&
      isAuthAddressAuthorized({
        address: activeAddress,
        connectedAccounts: storedConnectedAccounts,
      }),
    [activeAddress, isSigningOutAll, storedConnectedAccounts]
  );

  const jwtPollingStoredConnectedAccounts = useMemo(() => {
    if (isSigningOutAll) {
      return [];
    }
    if (!activeAddress) {
      return storedConnectedAccounts;
    }

    if (!activeStoredAccount?.profileHandle) {
      return storedConnectedAccounts;
    }

    return storedConnectedAccounts.filter(
      (storedAccount) =>
        normalizeAddress(storedAccount.address) !==
        normalizeAddress(activeAddress)
    );
  }, [
    activeAddress,
    activeStoredAccount?.profileHandle,
    isSigningOutAll,
    storedConnectedAccounts,
  ]);

  const jwtConnectedAccountUnreadNotifications =
    useConnectedAccountsUnreadNotifications(jwtPollingStoredConnectedAccounts);

  const { notifications: activeUnreadNotifications } = useUnreadNotifications(
    hasValidWalletAuth ? (activeStoredAccount?.profileHandle ?? null) : null,
    {
      enabled: hasValidWalletAuth,
      profileId: activeStoredAccount?.profileId,
    }
  );

  const connectedAccountUnreadNotifications = useMemo(() => {
    const unreadNotificationsByAddress = {
      ...jwtConnectedAccountUnreadNotifications,
    };

    if (activeStoredAccount?.profileHandle) {
      const activeAccountAddress = normalizeAddress(
        activeStoredAccount.address
      );
      const activeUnreadCount = activeUnreadNotifications?.unread_count;

      if (typeof activeUnreadCount === "number") {
        unreadNotificationsByAddress[activeAccountAddress] = activeUnreadCount;
      }
    } else if (activeStoredAccount) {
      const activeAccountAddress = normalizeAddress(
        activeStoredAccount.address
      );
      unreadNotificationsByAddress[activeAccountAddress] ??= 0;
    }

    return unreadNotificationsByAddress;
  }, [
    activeStoredAccount,
    activeUnreadNotifications?.unread_count,
    jwtConnectedAccountUnreadNotifications,
  ]);

  const contextValue = useMemo(
    (): SeizeConnectContextType => ({
      address: isSigningOutAll ? undefined : activeAddress,
      walletName: !isSigningOutAll && isActiveWalletConnected
        ? appKitModalState.walletName
        : undefined,
      walletIcon: !isSigningOutAll && isActiveWalletConnected
        ? appKitModalState.walletIcon
        : undefined,
      isSafeWallet: !isSigningOutAll && isActiveWalletConnected
        ? appKitModalState.isSafeWallet
        : false,
      seizeConnect,
      seizeConnectFresh,
      seizeDisconnect,
      seizeDisconnectAndLogout,
      seizeDisconnectAndLogoutAll,
      seizeAcceptConnection,
      seizeBeginBrowserConnectorHandoff,
      seizeEndBrowserConnectorHandoff,
      seizeSwitchConnectedAccount,
      seizeAddConnectedAccount: seizeAddConnectedAccountForRuntime,
      isAddingConnectedAccount,
      seizeConnectOpen:
        !isSigningOutAll &&
        (isConnectModalOpen ||
          isConnectIntentWaitingForAppKit ||
          capacitorConnectView !== "closed" ||
          isCapacitorHandoffPending),
      isConnected: !isSigningOutAll && isActiveWalletConnected,
      isDisconnecting,
      canSignActiveWallet: !isSigningOutAll && isActiveWalletConnected,
      hasActiveWalletAddress,
      hasValidWalletAuth,
      isSigningOutAll,
      isAuthenticated: hasValidWalletAuth,
      connectionState: walletState.status, // Unified state machine
      walletState, // Expose unified state for advanced consumers
      hasInitializationError,
      initializationError,
      connectedAccounts,
      canAddConnectedAccount,
      connectedAccountUnreadNotifications,
    }),
    [
      activeAddress,
      hasActiveWalletAddress,
      hasValidWalletAuth,
      isSigningOutAll,
      isActiveWalletConnected,
      isAddingConnectedAccount,
      isDisconnecting,
      connectedAccounts,
      appKitModalState.walletName,
      appKitModalState.walletIcon,
      appKitModalState.isSafeWallet,
      seizeConnect,
      seizeConnectFresh,
      seizeDisconnect,
      seizeDisconnectAndLogout,
      seizeDisconnectAndLogoutAll,
      seizeAcceptConnection,
      seizeBeginBrowserConnectorHandoff,
      seizeEndBrowserConnectorHandoff,
      seizeSwitchConnectedAccount,
      seizeAddConnectedAccountForRuntime,
      isConnectIntentWaitingForAppKit,
      isConnectModalOpen,
      capacitorConnectView,
      isCapacitorHandoffPending,
      liveAccount.isConnected,
      walletState,
      hasInitializationError,
      initializationError,
      canAddConnectedAccount,
      connectedAccountUnreadNotifications,
    ]
  );

  return (
    <WalletErrorBoundary>
      <SeizeConnectContext.Provider value={contextValue}>
        {children}
        <SeizeConnectModal />
        {isAppKitCreated && (
          <AppKitModalBridge store={appKitModalBridgeStore} />
        )}
        {capacitor.isCapacitor && (
          <CapacitorConnectFlow
            view={capacitorConnectView}
            setView={setCapacitorConnectView}
            disconnectExternalWallet={disconnectExternalWalletBeforeSelection}
            openExternalWallets={openExternalWallets}
            onHandoffStateChange={setIsCapacitorHandoffPending}
          />
        )}
      </SeizeConnectContext.Provider>
    </WalletErrorBoundary>
  );
};
