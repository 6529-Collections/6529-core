import styles from "./AppWallet.module.scss";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { useChains, useConnections, useSwitchChain } from "wagmi";
import HeaderUserConnect from "../header/user/HeaderUserConnect";
import { Container, Row, Col } from "react-bootstrap";
import {
  getWalletAddress,
  getAuthJwt,
  getRefreshToken,
  getWalletRole,
} from "../../services/auth/auth.utils";
import { useSeizeConnectContext } from "../auth/SeizeConnectContext";

export default function AppWalletConnect(
  props: Readonly<{
    scheme?: string;
    setCompleted: (value: boolean) => void;
  }>
) {
  const router = useRouter();
  const account = useSeizeConnectContext();
  const connections = useConnections();
  const chains = useChains();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const { requestId, chainId } = router.query;

  const requestedChainId = chainId ? parseInt(chainId as string) : 1;
  const requestedChain = chains.find((c) => c.id === requestedChainId);
  const [isRequestedChain, setIsRequestedChain] = useState(false);

  const openApp = useCallback(() => {
    const connection = connections[0];
    const connectionInfo = {
      accounts: connection.accounts.map((account) => account.toLowerCase()),
      chainId: connection.chainId,
      auth: getAuth(),
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
  }, [connections]);

  useEffect(() => {
    const connection = connections[0];
    setIsRequestedChain(connection?.chainId === requestedChainId);
  }, [connections]);

  function getAuth() {
    return {
      address: getWalletAddress(),
      token: getAuthJwt(),
      refreshToken: getRefreshToken(),
      role: getWalletRole(),
    };
  }

  function onDisconnect() {
    account.seizeDisconnectAndLogout();
  }

  return (
    <Container>
      <Row className="pb-3">
        <Col xs={12}>
          <span className={styles.circledNumber}>1</span>
          <span>Connect your wallet</span>
        </Col>
        {account.isConnected ? (
          <Col xs={12} className="pt-3">
            <Container>
              <Row>
                <Col xs={12}>Connected Address</Col>
                <Col xs={12}>
                  <code>{account.address?.toLowerCase()}</code>
                </Col>
                <Col xs={12}>
                  <button
                    onClick={() => onDisconnect()}
                    className="mt-3 tw-whitespace-nowrap tw-inline-flex tw-items-center tw-cursor-pointer tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-leading-6 tw-rounded-lg tw-font-semibold tw-text-white tw-border-0 tw-ring-1 tw-ring-inset tw-ring-primary-500 hover:tw-ring-primary-600 placeholder:tw-text-iron-300 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset tw-shadow-sm hover:tw-bg-primary-600 tw-transition tw-duration-300 tw-ease-out">
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
        className={`pt-3 pb-3 ${
          isRequestedChain || !account.isConnected ? styles.disabled : ""
        }`}>
        <Col xs={12}>
          <span className={styles.circledNumber}>2</span>
          <span>
            Switch to {requestedChain?.name ?? `chain ${requestedChainId}`}
          </span>
        </Col>
        <Col xs={12} className="pt-4">
          <Container>
            <Row>
              <Col>
                <button
                  disabled={isSwitchingChain}
                  onClick={() => switchChain({ chainId: requestedChainId })}
                  className="tw-whitespace-nowrap tw-inline-flex tw-items-center tw-cursor-pointer tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-leading-6 tw-rounded-lg tw-font-semibold tw-text-white tw-border-0 tw-ring-1 tw-ring-inset tw-ring-primary-500 hover:tw-ring-primary-600 placeholder:tw-text-iron-300 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset tw-shadow-sm hover:tw-bg-primary-600 tw-transition tw-duration-300 tw-ease-out">
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
          !account.isConnected || !isRequestedChain ? styles.disabled : ""
        }`}>
        <Col xs={12}>
          <span className={styles.circledNumber}>3</span>
          <span>Transfer Connection to 6529 CORE</span>
        </Col>
        <Col xs={12} className="pt-4">
          <Container>
            <Row>
              <Col>
                <button
                  onClick={openApp}
                  className="tw-whitespace-nowrap tw-inline-flex tw-items-center tw-cursor-pointer tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-leading-6 tw-rounded-lg tw-font-semibold tw-text-white tw-border-0 tw-ring-1 tw-ring-inset tw-ring-primary-500 hover:tw-ring-primary-600 placeholder:tw-text-iron-300 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset tw-shadow-sm hover:tw-bg-primary-600 tw-transition tw-duration-300 tw-ease-out">
                  Open 6529 CORE
                </button>
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
    </Container>
  );
}
