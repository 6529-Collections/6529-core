import styles from "./HeaderUser.module.scss";
import React, { useEffect, useState } from "react";
import { Modal, Button, Accordion } from "react-bootstrap";
import { Connector, CreateConnectorFn, useConnect, useConnectors } from "wagmi";
import Image from "next/image";
import { walletConnect } from "wagmi/connectors";
import { CW_PROJECT_ID } from "../../../constants";
import { isElectron } from "../../../helpers";
import Link from "next/link";

interface HeaderUserConnectModalProps {
  show: boolean;
  onHide: () => void;
}

export default function HeaderUserConnectModal({
  show,
  onHide,
}: Readonly<HeaderUserConnectModalProps>) {
  const connectors = useConnectors();

  const isBrowser = !isElectron();

  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!show) {
      setActiveKey(null);
    }
  }, [show]);

  const handleToggle = (key: string) => {
    setActiveKey(activeKey === key ? null : key);
  };

  function otherConnectors() {
    const order = ["MetaMask", "WalletConnect", "Coinbase Wallet", "Safe"];
    return connectors
      .flat()
      .filter((c) => c.type !== "browser")
      .filter((c) => c.type !== "seed-wallet")
      .sort((a, b) => {
        return order.indexOf(a.name) - order.indexOf(b.name);
      });
  }

  function seedConnectors() {
    return connectors.flat().filter((c) => c.type === "seed-wallet");
  }

  function browserConnectors() {
    return connectors.flat().filter((c) => c.type === "browser");
  }

  function printOtherConnectors(extraClass: string = "") {
    return (
      <div
        className={`${extraClass} d-flex flex-wrap align-items-center justify-content-center gap-2`}>
        {otherConnectors().map((c) => (
          <ConnectorSelector
            key={c.id}
            connector={c}
            selected={() => {
              onHide();
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <Modal
      className={styles.connectModal}
      animation={show}
      show={show}
      onHide={onHide}
      backdrop
      keyboard={false}
      centered>
      <Modal.Header>
        <Modal.Title>Choose Connector</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isBrowser ? (
          printOtherConnectors("mb-3")
        ) : (
          <>
            <Accordion activeKey={activeKey}>
              <Accordion.Item defaultChecked={true} eventKey={"0"}>
                <Accordion.Button
                  className={styles.connectorCategoryAccordionButton}
                  onClick={() => handleToggle("0")}>
                  <b>Seed Wallet</b>
                </Accordion.Button>
                <Accordion.Body
                  className={styles.connectorCategoryAccordionBody}>
                  <div className="d-flex flex-wrap align-items-center justify-content-center gap-2">
                    {seedConnectors().map((c) => (
                      <ConnectorSelector
                        key={c.id}
                        connector={c}
                        selected={() => {
                          onHide();
                        }}
                      />
                    ))}
                    {seedConnectors().length === 0 && (
                      <div className="text-center">
                        <p>
                          Create or import a seed wallet in Seed Wallets Page
                          under Network tab
                          <br />
                          <Link
                            href="/network/seed-wallets"
                            onClick={() => {
                              if (
                                window.location.pathname ===
                                "/network/seed-wallets"
                              ) {
                                onHide();
                              }
                            }}
                            className="decoration-hover-underline"
                            style={{
                              color: "#0070f3",
                              cursor: "pointer",
                            }}>
                            take me there
                          </Link>
                        </p>
                        <p></p>
                      </div>
                    )}
                  </div>
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>
            <Accordion activeKey={activeKey} className="pt-3">
              <Accordion.Item defaultChecked={true} eventKey={"1"}>
                <Accordion.Button
                  className={styles.connectorCategoryAccordionButton}
                  onClick={() => handleToggle("1")}>
                  <b>Browser</b>
                </Accordion.Button>
                <Accordion.Body
                  className={styles.connectorCategoryAccordionBody}>
                  <div className="d-flex flex-wrap align-items-center justify-content-center gap-2">
                    {browserConnectors().map((c) => (
                      <ConnectorSelector
                        key={c.id}
                        connector={c}
                        selected={() => {
                          onHide();
                        }}
                      />
                    ))}
                  </div>
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>
            <Accordion activeKey={activeKey} className="pt-3 pb-3">
              <Accordion.Item defaultChecked={true} eventKey={"2"}>
                <Accordion.Button
                  className={styles.connectorCategoryAccordionButton}
                  onClick={() => handleToggle("2")}>
                  <b>Third-Party</b>
                </Accordion.Button>
                <Accordion.Body
                  className={styles.connectorCategoryAccordionBody}>
                  {printOtherConnectors()}
                </Accordion.Body>
              </Accordion.Item>
            </Accordion>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}

function ConnectorSelector(
  props: Readonly<{
    connector: Connector;
    selected(): void;
  }>
) {
  const { connect, error } = useConnect();

  useEffect(() => {
    if (error) {
      alert("something went wrong");
      console.log("error", error);
    }
  }, [error]);

  const onConnect = () => {
    let c: Connector | CreateConnectorFn = props.connector;
    if (c.type === "walletConnect") {
      c = walletConnect({
        projectId: CW_PROJECT_ID,
      });
    }
    connect({
      connector: c,
    });
    props.selected();
  };

  function printImage() {
    let imageSrc = "";
    let imageClass = "";
    if (props.connector.type === "seed-wallet") {
      imageSrc = props.connector.icon ?? "";
      imageClass = styles.seedConnectorImage;
    }

    switch (props.connector.name) {
      case "MetaMask":
        imageSrc = "/metamask.svg";
        break;
      case "WalletConnect":
        imageSrc = "/walletconnect.svg";
        break;
      case "Coinbase Wallet":
        imageSrc = "/coinbase.svg";
        break;
      case "Safe":
        imageSrc = "/safe.svg";
        break;
      case "Chrome":
        imageSrc = "/chrome.svg";
        break;
      case "Firefox":
        imageSrc = "/firefox.svg";
        break;
      case "Brave":
      case "Brave Wallet":
        imageSrc = "/brave.svg";
        break;
      case "Rabby Wallet":
        imageSrc = "/rabby.png";
        break;
    }

    if (imageSrc) {
      return (
        <Image
          className={imageClass}
          fetchPriority="high"
          loading="eager"
          height={34}
          width={34}
          src={imageSrc}
          alt={props.connector.name}
        />
      );
    }

    return <></>;
  }

  return (
    <Button
      variant="outline-secondary"
      onClick={onConnect}
      className="btn-block pt-3 pb-3 d-flex align-items-center justify-content-start gap-3">
      {printImage()}
      <span>{props.connector.name}</span>
    </Button>
  );
}
