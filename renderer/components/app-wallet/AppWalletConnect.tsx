import styles from "./AppWallet.module.scss";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { useAccount, useConnect, useConnections, useDisconnect } from "wagmi";
import HeaderUserConnect from "../header/user/HeaderUserConnect";
import { Container, Row, Col } from "react-bootstrap";

export default function AppWalletConnect(
  props: Readonly<{
    setCompleted: (value: boolean) => void;
  }>
) {
  const router = useRouter();
  const account = useAccount();
  const connect = useConnect();
  const connections = useConnections();
  const { disconnect } = useDisconnect();

  const { requestId } = router.query;

  useEffect(() => {
    if (connect.error) {
      console.error(connect.error);
    }
  }, [connect.error]);

  async function openApp() {
    const connection = connections[0];
    const connectionInfo = {
      accounts: connection.accounts.map((account) => account.toLowerCase()),
      chainId: connection.chainId,
    };
    const serializedInfo = JSON.stringify({
      requestId,
      data: connectionInfo,
    });
    const deepLink = `core6529://connector?data=${encodeURIComponent(
      serializedInfo
    )}`;
    window.location.href = deepLink;
    props.setCompleted(true);
  }

  function onDisconnect() {
    for (const connection of connections) {
      disconnect({
        connector: connection.connector,
      });
    }
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
      <Row className={`pt-3 ${!account.isConnected ? styles.disabled : ""}`}>
        <Col xs={12}>
          <span className={styles.circledNumber}>2</span>
          <span>Transfer Connection to Seize App</span>
        </Col>
        <Col xs={12} className="pt-4">
          <Container>
            <Row>
              <Col>
                <button
                  onClick={openApp}
                  className="tw-whitespace-nowrap tw-inline-flex tw-items-center tw-cursor-pointer tw-bg-primary-500 tw-px-4 tw-py-2.5 tw-text-sm tw-leading-6 tw-rounded-lg tw-font-semibold tw-text-white tw-border-0 tw-ring-1 tw-ring-inset tw-ring-primary-500 hover:tw-ring-primary-600 placeholder:tw-text-iron-300 focus:tw-outline-none focus:tw-ring-1 focus:tw-ring-inset tw-shadow-sm hover:tw-bg-primary-600 tw-transition tw-duration-300 tw-ease-out">
                  Open Seize App
                </button>
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
    </Container>
  );
}
