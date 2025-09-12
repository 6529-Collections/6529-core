"use client";

import { useAppKit } from "@reown/appkit/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Accordion, Button, Modal } from "react-bootstrap";
import { Connector, useConnect, useConnectors } from "wagmi";
import { isElectron } from "../../../helpers";
import { formatAddress } from "../../../helpers/Helpers";
import styles from "./HeaderUser.module.scss";

interface HeaderUserConnectModalProps {
  show: boolean;
  onHide: () => void;
}

export default function HeaderUserConnectModal({
  show,
  onHide,
}: Readonly<HeaderUserConnectModalProps>) {
  const connectors = useConnectors()
    .filter((c) => c.id !== "w3mAuth" && c.id != "injected")
    .filter((c) => c.id !== "injected");

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
    const conns = otherConnectors();
    return (
      <div
        className={`${extraClass} d-flex flex-wrap align-items-center justify-content-center gap-2`}>
        {conns.map((c) => (
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
                          Create or import a seed wallet in Core Wallets Page
                          under Network tab
                          <br />
                          <Link
                            href="/core/core-wallets"
                            onClick={() => {
                              if (
                                window.location.pathname ===
                                "/core/core-wallets"
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
  const { connectAsync, error } = useConnect();
  const { open } = useAppKit();

  useEffect(() => {
    if (error) {
      alert("Something went wrong");
      console.log("error", error);
    }
  }, [error]);

  const onConnect = () => {
    const connector = props.connector;
    if (connector.type === "walletConnect") {
      open({ view: "ConnectingWalletConnectBasic" });
    } else {
      connectAsync({
        connector: props.connector,
      });
    }
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
      <span className="d-flex flex-column align-items-start gap-1">
        <span>{props.connector.name}</span>
        {props.connector.type === "seed-wallet" && (
          <span className="font-smaller">
            {formatAddress(props.connector.id)}
          </span>
        )}
      </span>
    </Button>
  );
}
