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

type NativeAuthState =
  | {
      readonly key: string;
      readonly payload: BrowserConnectorSignedNativeAuth;
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
  const { address: liveAddress, isConnected: isLiveConnected } = useAccount();
  const liveChainId = useChainId();
  const chains = useChains();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const nativeAuthAttemptKeyRef = useRef<string | null>(null);

  const requestId = searchParams.get("requestId");
  const chainId = searchParams.get("chainId");
  const existingAuthAddress = searchParams.get("existingAuthAddress");
  const refreshTokenClientType = getRefreshTokenClientTypeForAuthMode(
    searchParams.get("authMode")
  );
  const requiresNativeSessionAuth = refreshTokenClientType !== null;
  const normalizedLiveAddress = useMemo(
    () => (typeof liveAddress === "string" ? liveAddress.toLowerCase() : null),
    [liveAddress]
  );
  const normalizedExistingAuthAddress = useMemo(() => {
    if (typeof existingAuthAddress !== "string") {
      return null;
    }
    const normalized = existingAuthAddress.toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
  }, [existingAuthAddress]);

  const requestedChain =
    chains.find((c) => c.id === parseInt(chainId as string)) ??
    chains[0];
  const requestedChainId = requestedChain.id;
  const requestedChainName = requestedChain.name;

  const [isRequestedChain, setIsRequestedChain] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [nativeAuthState, setNativeAuthState] = useState<NativeAuthState>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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
        includeAuthHeaders: false,
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
      createNativeAuthPayload,
      isRequestedChain,
      nativeAuthKey,
      normalizedLiveAddress,
      preparedNativeAuth,
      requestedChainName,
      requiresNativeSessionAuth,
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
    const deepLink = `${props.scheme}://connector?data=${encodeURIComponent(
      serializedInfo
    )}`;
    window.location.href = deepLink;
    props.setCompleted(true);
  }, [
    liveChainId,
    normalizedLiveAddress,
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

  const handleAuthModalSign = useCallback(async () => {
    const payload = await prepareNativeSessionAuth({ force: true });
    if (payload) {
      setShowAuthModal(false);
    }
  }, [prepareNativeSessionAuth]);

  const isOpenDesktopDisabled =
    isAuthenticating || !isLiveConnected || !isRequestedChain;

  const openDesktopLabel = (() => {
    if (!requiresNativeSessionAuth) {
      return "Open 6529 Desktop";
    }
    if (isAuthenticating) {
      return "Signing...";
    }
    if (!preparedNativeAuth) {
      return "Upgrade Authentication";
    }
    return "Open 6529 Desktop";
  })();
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
          className={`py-3 ${
            isRequestedChain || !isLiveConnected ? disabledClass : ""
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
          className={`pt-3 ${
            !isLiveConnected || !isRequestedChain ? disabledClass : ""
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
                    {openDesktopLabel}
                  </button>
                  {requiresNativeSessionAuth && preparedNativeAuth && (
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
                        onClick={() => setShowAuthModal(true)}
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
      <Modal
        show={showAuthModal}
        onHide={() => !isAuthenticating && setShowAuthModal(false)}
        centered
        backdrop={isAuthenticating ? "static" : true}
        keyboard={!isAuthenticating}
        dialogClassName={authModalStyles["signModalDialog"] ?? ""}
        contentClassName={authModalStyles["signModalSurface"] ?? ""}
      >
        <Modal.Header
          closeButton={!isAuthenticating}
          className={authModalStyles["signModalHeader"]}
        >
          <Modal.Title className={authModalStyles["signModalTitle"]}>
            Upgrade Authentication
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className={authModalStyles["signModalBody"]}>
          <p className={authModalStyles["signModalLead"]}>
            6529 Desktop needs an updated desktop authentication signature for
            this browser wallet connection.
          </p>
          <ul className={authModalStyles["signModalList"]}>
            <li>Click Sign to start the authentication upgrade.</li>
            <li>Confirm the request in your wallet.</li>
          </ul>
        </Modal.Body>
        <Modal.Footer className={authModalStyles["signModalFooter"]}>
          <button
            disabled={isAuthenticating}
            onClick={() => setShowAuthModal(false)}
            className={authModalStyles["signModalCancelButton"]}
          >
            Cancel
          </button>
          <button
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
