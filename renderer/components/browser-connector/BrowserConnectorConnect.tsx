"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Col, Container, Row } from "react-bootstrap";
import {
  useAccount,
  useChainId,
  useChains,
  useSwitchChain,
} from "wagmi";
import { getConnectedWalletAccounts } from "../../services/auth/auth.utils";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";
import HeaderUserConnect from "../header/user/HeaderUserConnect";
import styles from "./BrowserConnector.module.scss";

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

  const requestId = searchParams?.get("requestId");
  const chainId = searchParams?.get("chainId");

  const requestedChain =
    chains.find((c) => c.id === parseInt(chainId as string)) ?? chains[0] ?? null;
  const requestedChainId = requestedChain?.id ?? liveChainId ?? 1;
  const requestedChainName = requestedChain?.name ?? `chain ${requestedChainId}`;

  const [isRequestedChain, setIsRequestedChain] = useState(false);

  const getAuthForConnectedAddress = useCallback(() => {
    if (!liveAddress) {
      return {
        address: null,
        token: null,
        refreshToken: null,
        role: null,
      };
    }

    const normalizedLiveAddress = liveAddress.toLowerCase();
    const matchedStoredAccount = getConnectedWalletAccounts().find(
      (storedAccount) =>
        storedAccount.address.toLowerCase() === normalizedLiveAddress
    );

    if (!matchedStoredAccount) {
      return {
        address: null,
        token: null,
        refreshToken: null,
        role: null,
      };
    }

    return {
      address: matchedStoredAccount.address,
      token: matchedStoredAccount.jwt,
      refreshToken: matchedStoredAccount.refreshToken,
      role: matchedStoredAccount.role,
    };
  }, [liveAddress]);

  const openApp = useCallback(() => {
    const normalizedLiveAddress =
      typeof liveAddress === "string" ? liveAddress.toLowerCase() : null;
    const auth = getAuthForConnectedAddress();
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
    getAuthForConnectedAddress,
    liveAddress,
    liveChainId,
    props.scheme,
    props.setCompleted,
    requestId,
    requestedChainId,
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
                  onClick={openApp}
                  className="tw-inline-flex tw-cursor-pointer tw-items-center tw-whitespace-nowrap tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-font-semibold tw-leading-6 tw-text-white tw-shadow-sm tw-ring-1 tw-ring-inset tw-ring-primary-500 tw-transition tw-duration-300 tw-ease-out placeholder:tw-text-iron-300 hover:tw-bg-primary-600 hover:tw-ring-primary-600 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset"
                >
                  Open 6529 Desktop
                </button>
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
    </Container>
  );
}
