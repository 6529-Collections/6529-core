"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Col, Container, Row } from "react-bootstrap";
import { useAccount, useChainId, useChains, useSwitchChain } from "wagmi";
import {
  hasActiveSessionV2Auth,
  setActiveWalletAccount,
} from "@/services/auth/auth.utils";
import {
  createConnectionShare,
  verifyActiveSessionV2WebSession,
} from "@/services/auth/session-v2.utils";
import { useAuth } from "../auth/Auth";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";
import HeaderUserConnect from "../header/user/HeaderUserConnect";
import styles from "./BrowserConnector.module.scss";

const NATIVE_SESSION_AUTH_MODE = "session-v2-native";

interface BrowserConnectorConnectionShareAuth {
  readonly sessionVersion: "v2";
  readonly transferType: "connection-share";
  readonly connection_share_code: string;
  readonly address: string;
  readonly target_client_type: "native";
  readonly expires_at: string;
}

type NativeAuthState =
  | {
      readonly key: string;
      readonly payload: BrowserConnectorConnectionShareAuth;
    }
  | null;

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export default function BrowserConnectorConnect(
  props: Readonly<{
    scheme?: string | null;
    setCompleted: (value: boolean) => void;
  }>
) {
  const searchParams = useSearchParams();
  const account = useSeizeConnectContext();
  const { requestSessionUpgrade } = useAuth();
  const { address: liveAddress, isConnected: isLiveConnected } = useAccount();
  const liveChainId = useChainId();
  const chains = useChains();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const requestSessionUpgradeRef = useRef(requestSessionUpgrade);
  const nativeAuthAttemptKeyRef = useRef<string | null>(null);

  const requestId = searchParams.get("requestId");
  const chainId = searchParams.get("chainId");
  const requiresNativeSessionAuth =
    searchParams.get("authMode") === NATIVE_SESSION_AUTH_MODE;
  const normalizedLiveAddress = useMemo(
    () => (typeof liveAddress === "string" ? liveAddress.toLowerCase() : null),
    [liveAddress]
  );

  const requestedChain =
    chains.find((c) => c.id === parseInt(chainId as string)) ??
    chains[0];
  const requestedChainId = requestedChain.id;
  const requestedChainName = requestedChain.name;

  const [isRequestedChain, setIsRequestedChain] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nativeAuthState, setNativeAuthState] = useState<NativeAuthState>(null);
  const [authStatus, setAuthStatus] = useState<
    "idle" | "checking" | "upgrading" | "ready" | "error"
  >("idle");

  const nativeAuthKey =
    requestId && normalizedLiveAddress
      ? `${requestId}:${normalizedLiveAddress}:${requestedChainId}`
      : null;
  const preparedNativeAuth =
    nativeAuthState?.key === nativeAuthKey ? nativeAuthState.payload : null;

  useEffect(() => {
    requestSessionUpgradeRef.current = requestSessionUpgrade;
  }, [requestSessionUpgrade]);

  const verifyExistingWebSession = useCallback(
    async (
      address: string,
      signal?: AbortSignal
    ): Promise<boolean> => {
      if (!hasActiveSessionV2Auth({ address })) {
        return false;
      }

      setActiveWalletAccount(address);
      return await verifyActiveSessionV2WebSession({
        address,
        abortSignal: signal,
      });
    },
    []
  );

  const requestBrowserSessionUpgrade = useCallback(
    async (
      address: string,
      signal?: AbortSignal
    ): Promise<boolean> => {
      setAuthStatus("upgrading");
      const upgradeResult = await requestSessionUpgradeRef.current?.(address);

      if (signal?.aborted) {
        return false;
      }

      if (!upgradeResult?.success) {
        throw new Error(
          "Update auth in the browser before opening 6529 Desktop."
        );
      }

      const hasActiveWebSession = await verifyActiveSessionV2WebSession({
        address,
        abortSignal: signal,
      });

      if (!hasActiveWebSession) {
        throw new Error("Couldn't verify the upgraded browser session. Try again.");
      }

      return true;
    },
    []
  );

  const createDesktopAuthPayload = useCallback(
    async (
      address: string,
      signal?: AbortSignal
    ): Promise<BrowserConnectorConnectionShareAuth | null> => {
      setAuthStatus("checking");
      const share = await createConnectionShare({ signal });

      if (signal?.aborted) {
        return null;
      }

      if (share.address.toLowerCase() !== address) {
        throw new Error(
          "Desktop auth was prepared for a different wallet. Try again."
        );
      }

      return {
        sessionVersion: "v2",
        transferType: "connection-share",
        connection_share_code: share.connection_share_code,
        address: share.address,
        target_client_type: "native",
        expires_at: share.expires_at,
      };
    },
    []
  );

  const prepareNativeSessionAuth = useCallback(
    async ({
      force = false,
      signal,
    }: {
      readonly force?: boolean | undefined;
      readonly signal?: AbortSignal | undefined;
    } = {}): Promise<BrowserConnectorConnectionShareAuth | null> => {
      if (!requiresNativeSessionAuth) {
        return null;
      }

      if (!nativeAuthKey || !normalizedLiveAddress) {
        setAuthError("Connect your wallet before returning to 6529 Desktop.");
        return null;
      }

      if (!isRequestedChain) {
        setAuthError(`Switch to ${requestedChainName} before continuing.`);
        return null;
      }

      if (!force && preparedNativeAuth) {
        return preparedNativeAuth;
      }

      if (!force && nativeAuthAttemptKeyRef.current === nativeAuthKey) {
        return null;
      }

      nativeAuthAttemptKeyRef.current = nativeAuthKey;
      setAuthError(null);
      setIsAuthenticating(true);
      setAuthStatus("checking");
      setNativeAuthState(null);

      try {
        let hasActiveWebSession = await verifyExistingWebSession(
          normalizedLiveAddress,
          signal
        );

        if (signal?.aborted) {
          return null;
        }

        if (!hasActiveWebSession) {
          hasActiveWebSession = await requestBrowserSessionUpgrade(
            normalizedLiveAddress,
            signal
          );
        }

        if (signal?.aborted || !hasActiveWebSession) {
          return null;
        }

        const payload = await createDesktopAuthPayload(
          normalizedLiveAddress,
          signal
        );

        if (!payload) {
          return null;
        }

        setNativeAuthState({ key: nativeAuthKey, payload });
        setAuthStatus("ready");
        return payload;
      } catch (error) {
        if (signal?.aborted) {
          return null;
        }

        setAuthStatus("error");
        setAuthError(
          getErrorMessage(
            error,
            "Couldn't prepare desktop authentication. Try again."
          )
        );
        return null;
      } finally {
        if (!signal?.aborted) {
          setIsAuthenticating(false);
        }
      }
    },
    [
      createDesktopAuthPayload,
      isRequestedChain,
      nativeAuthKey,
      normalizedLiveAddress,
      preparedNativeAuth,
      requestBrowserSessionUpgrade,
      requestedChainName,
      requiresNativeSessionAuth,
      verifyExistingWebSession,
    ]
  );

  const openApp = useCallback(async () => {
    setAuthError(null);
    if (!normalizedLiveAddress) {
      setAuthError("Connect your wallet before returning to 6529 Desktop.");
      return;
    }

    let desktopAuthPayload: unknown = preparedNativeAuth;
    if (requiresNativeSessionAuth) {
      const preparedPayload =
        preparedNativeAuth ?? (await prepareNativeSessionAuth({ force: true }));
      if (preparedPayload === null) {
        return;
      }
      desktopAuthPayload = preparedPayload;
    }

    const connectionInfo = {
      accounts: normalizedLiveAddress ? [normalizedLiveAddress] : [],
      chainId: liveChainId ?? requestedChainId,
      activeAddress: normalizedLiveAddress,
      auth: desktopAuthPayload,
    };
    const serializedInfo = JSON.stringify({
      requestId,
      data: connectionInfo,
    });
    const deepLink = `${props.scheme}://connector?data=${encodeURIComponent(
      serializedInfo
    )}`;
    window.location.href = deepLink;
    props.setCompleted(true);
  }, [
    liveChainId,
    normalizedLiveAddress,
    prepareNativeSessionAuth,
    preparedNativeAuth,
    props.scheme,
    props.setCompleted,
    requiresNativeSessionAuth,
    requestId,
    requestedChainId,
  ]);

  useEffect(() => {
    setIsRequestedChain(liveChainId === requestedChainId);
  }, [liveChainId, requestedChainId]);

  useEffect(() => {
    if (
      !requiresNativeSessionAuth ||
      !isLiveConnected ||
      !normalizedLiveAddress ||
      !isRequestedChain ||
      preparedNativeAuth
    ) {
      return;
    }

    const abortController = new AbortController();
    void prepareNativeSessionAuth({ signal: abortController.signal });

    return () => {
      abortController.abort();
    };
  }, [
    isLiveConnected,
    isRequestedChain,
    normalizedLiveAddress,
    prepareNativeSessionAuth,
    preparedNativeAuth,
    requiresNativeSessionAuth,
  ]);

  const isOpenDesktopDisabled =
    isAuthenticating ||
    !isLiveConnected ||
    !isRequestedChain ||
    (requiresNativeSessionAuth && !preparedNativeAuth);

  const openDesktopLabel = (() => {
    if (!requiresNativeSessionAuth) {
      return "Open 6529 Desktop";
    }
    if (authStatus === "upgrading") {
      return "Updating auth...";
    }
    if (isAuthenticating) {
      return "Preparing auth...";
    }
    return "Open 6529 Desktop";
  })();

  return (
    <Container>
      <Row className="pb-3">
        <Col xs={12}>
          <span className={styles["circledNumber"]}>1</span>
          <span>Connect your wallet</span>
        </Col>
        {isLiveConnected ? (
          <Col xs={12} className="pt-3">
            <Container>
              <Row>
                <Col xs={12}>Connected Address</Col>
                <Col xs={12}>
                  <code>{liveAddress?.toLowerCase()}</code>
                </Col>
                <Col xs={12}>
                  <button
                    onClick={() => account.seizeDisconnectAndLogout()}
                    className="mt-3 tw-inline-flex tw-cursor-pointer tw-items-center tw-whitespace-nowrap tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                  >
                    Disconnect
                  </button>
                </Col>
              </Row>
            </Container>
          </Col>
        ) : (
          <Col xs={12} className="pt-3">
            <Container>
              <Row>
                <Col>
                  <HeaderUserConnect />
                </Col>
              </Row>
            </Container>
          </Col>
        )}
      </Row>
      <hr />
      <Row
        className={`pt-3 pb-3 ${isRequestedChain || !isLiveConnected ? styles["disabled"] : ""}`}
      >
        <Col xs={12}>
          <span className={styles["circledNumber"]}>2</span>
          <span>Switch to {requestedChainName}</span>
        </Col>
        <Col xs={12} className="pt-4">
          <Container>
            <Row>
              <Col>
                <button
                  disabled={isSwitchingChain}
                  onClick={() => switchChain({ chainId: requestedChainId })}
                  className="tw-inline-flex tw-cursor-pointer tw-items-center tw-whitespace-nowrap tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                >
                  {isSwitchingChain ? "Switching..." : "Switch"}
                </button>
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
      <hr />
      <Row
        className={`pt-3 ${!isLiveConnected || !isRequestedChain ? styles["disabled"] : ""}`}
      >
        <Col xs={12}>
          <span className={styles["circledNumber"]}>3</span>
          <span>Transfer Connection to 6529 Desktop</span>
        </Col>
        <Col xs={12} className="pt-4">
          <Container>
            <Row>
              <Col>
                <button
                  disabled={isOpenDesktopDisabled}
                  onClick={openApp}
                  className="tw-inline-flex tw-cursor-pointer tw-items-center tw-whitespace-nowrap tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                >
                  {openDesktopLabel}
                </button>
                {requiresNativeSessionAuth && authStatus === "ready" && (
                  <p className="pt-3 text-success">
                    Auth is ready for 6529 Desktop.
                  </p>
                )}
                {authError && (
                  <>
                    <p className="pt-3 text-danger" role="alert">
                      {authError}
                    </p>
                    <button
                      disabled={isAuthenticating}
                      onClick={() =>
                        void prepareNativeSessionAuth({ force: true })
                      }
                      className="tw-inline-flex tw-cursor-pointer tw-items-center tw-whitespace-nowrap tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                    >
                      Try again
                    </button>
                  </>
                )}
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
    </Container>
  );
}
