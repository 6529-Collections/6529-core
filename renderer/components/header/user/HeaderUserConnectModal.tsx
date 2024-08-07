import styles from "./HeaderUser.module.scss";
import React, { useEffect } from "react";
import { Modal, Button } from "react-bootstrap";
import { Connector, CreateConnectorFn, useConnect, useConnectors } from "wagmi";
import Image from "next/image";
import { walletConnect } from "wagmi/connectors";
import { CW_PROJECT_ID } from "../../../constants";

interface HeaderUserConnectModalProps {
  show: boolean;
  onHide: () => void;
}

export default function HeaderUserConnectModal({
  show,
  onHide,
}: Readonly<HeaderUserConnectModalProps>) {
  const connectors = useConnectors();

  function sortedConnectors() {
    const order = [
      "MetaMask",
      "Chrome",
      "Firefox",
      "Brave",
      "WalletConnect",
      "Coinbase Wallet",
      "Safe",
    ];

    const sortedConnectors = connectors.flat().sort((a, b) => {
      return order.indexOf(a.name) - order.indexOf(b.name);
    });
    return sortedConnectors;
  }

  function nonBrowserConnectors() {
    const order = ["MetaMask", "WalletConnect", "Coinbase Wallet", "Safe"];
    return connectors
      .flat()
      .filter((c) => c.type !== "browser")
      .sort((a, b) => {
        return order.indexOf(a.name) - order.indexOf(b.name);
      });
  }

  function browserConnectors() {
    return connectors.flat().filter((c) => c.type === "browser");
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
        <div className="mb-2 d-flex flex-wrap align-items-center justify-content-center gap-2">
          {nonBrowserConnectors().map((c) => (
            <ConnectorSelector
              key={c.id}
              connector={c}
              selected={() => {
                onHide();
              }}
            />
          ))}
        </div>
        {browserConnectors().length > 0 && (
          <>
            <p className="mt-4">Browser Connectors</p>
            <div className="mb-2 d-flex flex-wrap align-items-center justify-content-center gap-2">
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

  if (props.connector.name === "Injected") {
    return <></>;
  }

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
          fetchPriority="high"
          loading="eager"
          height={25}
          width={25}
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
