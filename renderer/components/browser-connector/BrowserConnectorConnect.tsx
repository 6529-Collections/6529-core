"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Col, Container, Row } from "react-bootstrap";
import {
  useAccount,
  useChainId,
  useChains,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import {
  getSessionNonce,
  loginWithSessionV2,
} from "@/services/auth/session-v2.utils";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";
import HeaderUserConnect from "../header/user/HeaderUserConnect";
import styles from "./BrowserConnector.module.scss";

const NATIVE_SESSION_AUTH_MODE = "session-v2-native";

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

  const requestId = searchParams.get("requestId");
  const chainId = searchParams.get("chainId");
  const requiresNativeSessionAuth =
    searchParams.get("authMode") === NATIVE_SESSION_AUTH_MODE;

  const requestedChain =
    chains.find((c) => c.id === parseInt(chainId as string)) ?? chains[0] ?? null;
  const requestedChainId = requestedChain?.id ?? liveChainId ?? 1;
  const requestedChainName = requestedChain?.name ?? `chain ${requestedChainId}`;

  const [isRequestedChain, setIsRequestedChain] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const openApp = useCallback(async () => {
    setAuthError(null);
    const normalizedLiveAddress =
      typeof liveAddress === "string" ? liveAddress.toLowerCase() : null;
    if (!normalizedLiveAddress) {
      setAuthError("Connect your wallet before returning to 6529 Desktop.");
      return;
    }

    let auth: unknown = null;
    if (requiresNativeSessionAuth) {
      setIsAuthenticating(true);
      try {
        const nonceResponse = await getSessionNonce({
          signerAddress: normalizedLiveAddress,
          clientType: "native",
        });
        const clientSignature = await signMessageAsync({
          message: nonceResponse.signable_message,
        });
        const sessionResponse = await loginWithSessionV2({
          serverSignature: nonceResponse.server_signature,
          clientSignature,
          signerAddress: normalizedLiveAddress,
          role: null,
          clientType: "native",
        });
        if (
          sessionResponse.client_type !== "native" ||
          sessionResponse.address.toLowerCase() !== normalizedLiveAddress
        ) {
          throw new Error("Native session-v2 login returned a different wallet.");
        }
        auth = {
          sessionVersion: "v2",
          ...sessionResponse,
        };
      } catch (error) {
        setAuthError(
          error instanceof Error && error.message
            ? error.message
            : "Couldn't complete session-v2 authentication. Try again."
        );
        return;
      } finally {
        setIsAuthenticating(false);
      }
    }

    const connectionInfo = {
      accounts: normalizedLiveAddress ? [normalizedLiveAddress] : [],
      chainId: liveChainId ?? requestedChainId,
      activeAddress: normalizedLiveAddress,
      auth,
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
    liveAddress,
    liveChainId,
    props.scheme,
    props.setCompleted,
    requiresNativeSessionAuth,
    requestId,
    requestedChainId,
    signMessageAsync,
  ]);

  useEffect(() => {
    setIsRequestedChain(liveChainId === requestedChainId);
  }, [liveChainId, requestedChainId]);

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
                  disabled={isAuthenticating}
                  onClick={openApp}
                  className="tw-inline-flex tw-cursor-pointer tw-items-center tw-whitespace-nowrap tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                >
                  {isAuthenticating ? "Signing..." : "Open 6529 Desktop"}
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
  );
}
