"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Col, Container, Modal, Row } from "react-bootstrap";
import {
  useAccount,
  useChainId,
  useChains,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import {
  getSessionNonce,
  type RefreshTokenSessionClientType,
} from "@/services/auth/session-v2.utils";
import authModalStyles from "../auth/Auth.module.scss";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";
import HeaderUserConnect from "../header/user/HeaderUserConnect";
import styles from "./BrowserConnector.module.scss";
import BrowserConnectorWalletIntentNotice, {
  type BrowserConnectorWalletIntentNoticeType,
} from "./BrowserConnectorWalletIntentNotice";
import { normalizeBrowserConnectorAddress } from "./browserConnector.helpers";

const DESKTOP_SESSION_AUTH_MODE = "session-v2-desktop";
const LEGACY_NATIVE_SESSION_AUTH_MODE = "session-v2-native";

function getRefreshTokenClientTypeForAuthMode(
  authMode: string | null
): RefreshTokenSessionClientType | null {
  if (authMode === DESKTOP_SESSION_AUTH_MODE) {
    return "desktop";
  }
  if (authMode === LEGACY_NATIVE_SESSION_AUTH_MODE) {
    return "native";
  }
  return null;
}

interface BrowserConnectorSignedNativeAuth {
  readonly sessionVersion: "v2";
  readonly transferType: "signed-native-challenge";
  readonly address: string;
  readonly server_signature: string;
  readonly client_signature: string;
  readonly target_client_type: RefreshTokenSessionClientType;
}

interface BrowserConnectorExistingNativeAuth {
  readonly sessionVersion: "v2";
  readonly transferType: "existing-native-session";
  readonly address: string;
  readonly target_client_type: RefreshTokenSessionClientType;
}

type BrowserConnectorNativeAuth =
  | BrowserConnectorSignedNativeAuth
  | BrowserConnectorExistingNativeAuth;

type NativeAuthState = {
  readonly key: string;
  readonly payload: BrowserConnectorSignedNativeAuth;
} | null;

const getErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const normalizeQueryAddress = (value: string | null): string | null => {
  return normalizeBrowserConnectorAddress(value);
};

const normalizeQueryAddressList = (value: string | null): readonly string[] => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  const addresses: string[] = [];
  const seen = new Set<string>();
  for (const item of value.split(",")) {
    const normalized = normalizeQueryAddress(item.trim());
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    addresses.push(normalized);
  }

  return addresses;
};

export default function BrowserConnectorConnect(
  props: Readonly<{
    returnScheme: string;
    setCompleted: (value: boolean) => void;
  }>
) {
  const searchParams = useSearchParams();
  const account = useSeizeConnectContext();
  const { address: liveAddress, isConnected: isLiveConnected } = useAccount();
  const liveChainId = useChainId();
  const chains = useChains();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const nativeAuthAttemptKeyRef = useRef<string | null>(null);
  const dismissedNativeAuthKeyRef = useRef<string | null>(null);
  const nativeAuthAbortControllerRef = useRef<AbortController | null>(null);

  const requestId = searchParams.get("requestId");
  const chainId = searchParams.get("chainId");
  const existingAuthAddress = searchParams.get("existingAuthAddress");
  const intendedWalletAddress = searchParams.get("intendedWalletAddress");
  const originWalletAddress = searchParams.get("originWalletAddress");
  const knownWalletAddresses = searchParams.get("knownWalletAddresses");
  const refreshTokenClientType = getRefreshTokenClientTypeForAuthMode(
    searchParams.get("authMode")
  );
  const requiresNativeSessionAuth = refreshTokenClientType !== null;
  const normalizedLiveAddress = useMemo(
    () => (typeof liveAddress === "string" ? liveAddress.toLowerCase() : null),
    [liveAddress]
  );
  const normalizedExistingAuthAddress = useMemo(
    () => normalizeQueryAddress(existingAuthAddress),
    [existingAuthAddress]
  );
  const normalizedIntendedWalletAddress = useMemo(
    () => normalizeQueryAddress(intendedWalletAddress),
    [intendedWalletAddress]
  );
  const normalizedOriginWalletAddress = useMemo(
    () => normalizeQueryAddress(originWalletAddress),
    [originWalletAddress]
  );
  const normalizedKnownWalletAddresses = useMemo(
    () => normalizeQueryAddressList(knownWalletAddresses),
    [knownWalletAddresses]
  );

  const requestedChain =
    chains.find((c) => c.id === parseInt(chainId as string)) ?? chains[0];
  const requestedChainId = requestedChain.id;
  const requestedChainName = requestedChain.name;

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nativeAuthState, setNativeAuthState] = useState<NativeAuthState>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const isRequestedChain = liveChainId === requestedChainId;

  const walletIntentNotice =
    useMemo<BrowserConnectorWalletIntentNoticeType | null>(() => {
      if (
        normalizedIntendedWalletAddress &&
        normalizedLiveAddress !== normalizedIntendedWalletAddress
      ) {
        return {
          type: normalizedLiveAddress ? "switch-requested" : "connect-requested",
          address: normalizedIntendedWalletAddress,
        };
      }
      if (
        normalizedOriginWalletAddress &&
        normalizedLiveAddress === normalizedOriginWalletAddress
      ) {
        return { type: "already-connected" };
      }
      if (
        !normalizedIntendedWalletAddress &&
        normalizedLiveAddress &&
        normalizedKnownWalletAddresses.includes(normalizedLiveAddress)
      ) {
        return { type: "already-connected" };
      }
      return null;
    }, [
      normalizedIntendedWalletAddress,
      normalizedKnownWalletAddresses,
      normalizedLiveAddress,
      normalizedOriginWalletAddress,
    ]);
  const walletIntentError = walletIntentNotice
    ? walletIntentNotice.type === "already-connected"
      ? "Switch to a different browser wallet before continuing."
      : "Connect the requested wallet before continuing."
    : null;
  const isWalletIntentSatisfied = !walletIntentError;

  const nativeAuthKey =
    requestId && normalizedLiveAddress && refreshTokenClientType
      ? `${requestId}:${normalizedLiveAddress}:${requestedChainId}:${refreshTokenClientType}`
      : null;
  const existingNativeAuth = useMemo<BrowserConnectorExistingNativeAuth | null>(
    () =>
      refreshTokenClientType &&
      normalizedLiveAddress &&
      normalizedExistingAuthAddress === normalizedLiveAddress
        ? {
            sessionVersion: "v2",
            transferType: "existing-native-session",
            address: normalizedLiveAddress,
            target_client_type: refreshTokenClientType,
          }
        : null,
    [
      normalizedExistingAuthAddress,
      normalizedLiveAddress,
      refreshTokenClientType,
      requiresNativeSessionAuth,
    ]
  );
  const preparedNativeAuth: BrowserConnectorNativeAuth | null =
    nativeAuthState?.key === nativeAuthKey
      ? nativeAuthState.payload
      : existingNativeAuth;

  const createNativeAuthPayload = useCallback(
    async (
      address: string,
      signal?: AbortSignal
    ): Promise<BrowserConnectorSignedNativeAuth | null> => {
      if (!refreshTokenClientType) {
        return null;
      }
      const nonceResponse = await getSessionNonce({
        signerAddress: address,
        clientType: refreshTokenClientType,
        includeWalletAuthHeaders: false,
      });

      if (signal?.aborted) {
        return null;
      }

      const clientSignature = await signMessageAsync({
        message: nonceResponse.signable_message,
      });

      if (signal?.aborted) {
        return null;
      }

      return {
        sessionVersion: "v2",
        transferType: "signed-native-challenge",
        address,
        server_signature: nonceResponse.server_signature,
        client_signature: clientSignature,
        target_client_type: refreshTokenClientType,
      };
    },
    [refreshTokenClientType, signMessageAsync]
  );

  const prepareNativeSessionAuth = useCallback(
    async ({
      force = false,
      signal,
    }: {
      readonly force?: boolean | undefined;
      readonly signal?: AbortSignal | undefined;
    } = {}): Promise<BrowserConnectorNativeAuth | null> => {
      if (!requiresNativeSessionAuth) {
        return null;
      }

      if (!nativeAuthKey || !normalizedLiveAddress) {
        setAuthError("Connect your wallet before returning to 6529 Desktop.");
        return null;
      }

      if (!isWalletIntentSatisfied) {
        setAuthError(
          walletIntentError ?? "Connect the requested wallet before continuing."
        );
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
      setNativeAuthState(null);

      try {
        const payload = await createNativeAuthPayload(
          normalizedLiveAddress,
          signal
        );

        if (!payload) {
          return null;
        }

        setNativeAuthState({ key: nativeAuthKey, payload });
        return payload;
      } catch (error) {
        if (signal?.aborted) {
          return null;
        }

        setAuthError(
          getErrorMessage(error, "Couldn't prepare desktop authentication.")
        );
        return null;
      } finally {
        if (!signal?.aborted) {
          setIsAuthenticating(false);
        }
      }
    },
    [
      createNativeAuthPayload,
      isRequestedChain,
      isWalletIntentSatisfied,
      nativeAuthKey,
      normalizedLiveAddress,
      preparedNativeAuth,
      requestedChainName,
      requiresNativeSessionAuth,
      walletIntentError,
    ]
  );

  const openApp = useCallback(async () => {
    setAuthError(null);
    if (!normalizedLiveAddress) {
      setAuthError("Connect your wallet before returning to 6529 Desktop.");
      return;
    }

    if (!isWalletIntentSatisfied) {
      setAuthError(
        walletIntentError ?? "Connect the requested wallet before continuing."
      );
      return;
    }

    let desktopAuthPayload: unknown = preparedNativeAuth;
    if (requiresNativeSessionAuth) {
      if (!preparedNativeAuth) {
        setShowAuthModal(true);
        return;
      }
      desktopAuthPayload = preparedNativeAuth;
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
    const deepLink = `${props.returnScheme}://connector?data=${encodeURIComponent(
      serializedInfo
    )}`;
    window.location.href = deepLink;
    props.setCompleted(true);
  }, [
    liveChainId,
    isWalletIntentSatisfied,
    normalizedLiveAddress,
    preparedNativeAuth,
    props.returnScheme,
    props.setCompleted,
    requiresNativeSessionAuth,
    requestId,
    requestedChainId,
    walletIntentError,
  ]);

  const handleAuthModalSign = useCallback(async () => {
    nativeAuthAbortControllerRef.current?.abort();
    const controller = new AbortController();
    nativeAuthAbortControllerRef.current = controller;

    try {
      const payload = await prepareNativeSessionAuth({
        force: true,
        signal: controller.signal,
      });
      if (payload) {
        setShowAuthModal(false);
      }
    } finally {
      if (nativeAuthAbortControllerRef.current === controller) {
        nativeAuthAbortControllerRef.current = null;
      }
    }
  }, [prepareNativeSessionAuth]);

  const handleAuthModalCancel = useCallback(async () => {
    nativeAuthAbortControllerRef.current?.abort();
    nativeAuthAbortControllerRef.current = null;
    if (nativeAuthKey) {
      dismissedNativeAuthKeyRef.current = nativeAuthKey;
    }
    nativeAuthAttemptKeyRef.current = null;
    setNativeAuthState(null);
    setAuthError(null);
    setIsAuthenticating(false);
    setShowAuthModal(false);

    try {
      await account.seizeDisconnect();
    } catch (error) {
      dismissedNativeAuthKeyRef.current = null;
      setAuthError(
        getErrorMessage(error, "Couldn't disconnect this browser wallet.")
      );
      setShowAuthModal(true);
    }
  }, [account, nativeAuthKey]);

  useEffect(() => {
    if (!requiresNativeSessionAuth || preparedNativeAuth) {
      setShowAuthModal(false);
      return;
    }
    if (
      isLiveConnected &&
      isRequestedChain &&
      isWalletIntentSatisfied &&
      dismissedNativeAuthKeyRef.current !== nativeAuthKey
    ) {
      setShowAuthModal(true);
    }
  }, [
    isLiveConnected,
    isRequestedChain,
    isWalletIntentSatisfied,
    nativeAuthKey,
    preparedNativeAuth,
    requiresNativeSessionAuth,
  ]);

  useEffect(() => {
    if (!nativeAuthKey) {
      dismissedNativeAuthKeyRef.current = null;
    }
  }, [nativeAuthKey]);

  useEffect(() => {
    return () => {
      nativeAuthAbortControllerRef.current?.abort();
    };
  }, []);

  const isOpenDesktopDisabled =
    isAuthenticating ||
    !isLiveConnected ||
    !isRequestedChain ||
    !isWalletIntentSatisfied ||
    (requiresNativeSessionAuth && !preparedNativeAuth);

  const disabledClass = styles["disabled"] ?? "";

  return (
    <>
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
                      onClick={() => void account.seizeDisconnect()}
                      className="mt-3 tw-inline-flex tw-cursor-pointer tw-items-center tw-whitespace-nowrap tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                    >
                      Disconnect
                    </button>
                  </Col>
                </Row>
                {walletIntentNotice && (
                  <Row className="pt-4">
                    <Col xs={12}>
                      <BrowserConnectorWalletIntentNotice
                        notice={walletIntentNotice}
                      />
                    </Col>
                  </Row>
                )}
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
                {walletIntentNotice && (
                  <Row className="pt-4">
                    <Col xs={12}>
                      <BrowserConnectorWalletIntentNotice
                        notice={walletIntentNotice}
                      />
                    </Col>
                  </Row>
                )}
              </Container>
            </Col>
          )}
        </Row>
        <hr />
        <Row
          className={`py-3 ${
            isRequestedChain || !isLiveConnected || !isWalletIntentSatisfied
              ? disabledClass
              : ""
          }`}
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
                    disabled={isSwitchingChain || !isWalletIntentSatisfied}
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
          className={`pt-3 ${
            !isLiveConnected || !isRequestedChain || !isWalletIntentSatisfied
              ? disabledClass
              : ""
          }`}
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
                    Open 6529 Desktop
                  </button>
                  {authError && (
                    <p className="pt-3 text-danger" role="alert">
                      {authError}
                    </p>
                  )}
                </Col>
              </Row>
            </Container>
          </Col>
        </Row>
      </Container>
      <Modal
        show={showAuthModal && requiresNativeSessionAuth && !preparedNativeAuth}
        onHide={() => void handleAuthModalCancel()}
        centered
        backdrop="static"
        keyboard={false}
        dialogClassName={authModalStyles["signModalDialog"] ?? ""}
        contentClassName={authModalStyles["signModalSurface"] ?? ""}
      >
        <Modal.Header className={authModalStyles["signModalHeader"]}>
          <Modal.Title className={authModalStyles["signModalTitle"]}>
            Authentication Required
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className={authModalStyles["signModalBody"]}>
          <p className={authModalStyles["signModalLead"]}>
            6529 Desktop needs a desktop authentication signature for this
            browser wallet connection.
          </p>
          <ul className={authModalStyles["signModalList"]}>
            <li>Click Sign to start desktop authentication.</li>
            <li>Confirm the request in your wallet.</li>
          </ul>
          {authError && (
            <p className="pt-3 text-danger" role="alert">
              {authError}
            </p>
          )}
        </Modal.Body>
        <Modal.Footer className={authModalStyles["signModalFooter"]}>
          <button
            type="button"
            onClick={() => void handleAuthModalCancel()}
            className={authModalStyles["signModalCancelButton"]}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isAuthenticating}
            onClick={() => void handleAuthModalSign()}
            className={authModalStyles["signModalConfirmButton"]}
          >
            {isAuthenticating ? "Confirm in your wallet" : "Sign"}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
