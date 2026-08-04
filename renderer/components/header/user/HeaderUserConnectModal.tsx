"use client";

import {
  confirmModalBody,
  confirmModalHeader,
} from "@/components/shared/ConfirmModalShell";
import { useSeizeConnectContext } from "@/components/auth/seizeConnectContextValue";
import { isElectron } from "@/helpers";
import { formatAddress } from "@/helpers/Helpers";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { t } from "@/i18n/messages";
import { clearBrowserConnectorConnectIntent } from "@/wagmiConfig/browserConnector";
import { useAppKit } from "@reown/appkit/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Connector, useConnect, useConnectors } from "wagmi";
import {
  CONNECTOR_MODAL_BODY_CLASS,
  CONNECTOR_MODAL_DIALOG_CLASS,
} from "./connector-modal-layout";
import { getSeedWalletSelectionState } from "./seed-wallet-selection-state";

const CONNECTOR_MODAL_LOCALE = DEFAULT_LOCALE;

interface HeaderUserConnectModalProps {
  show: boolean;
  onHide: () => void;
}

export default function HeaderUserConnectModal({
  show,
  onHide,
}: Readonly<HeaderUserConnectModalProps>) {
  const connectors = useConnectors().filter(
    (c) => c.id !== "w3mAuth" && c.id !== "injected"
  );

  const isBrowser = !isElectron();
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    if (!show) setOpenSection(null);
  }, [show]);

  const toggle = (key: string) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const order = ["MetaMask", "WalletConnect", "Coinbase Wallet", "Safe"];
  const otherConnectors = connectors
    .flat()
    .filter((c) => c.type !== "browser" && c.type !== "seed-wallet")
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

  const seedConnectors = connectors
    .flat()
    .filter((c) => c.type === "seed-wallet");
  const browserConnectors = connectors
    .flat()
    .filter((c) => c.type === "browser");

  const handleHide = () => {
    clearBrowserConnectorConnectIntent();
    onHide();
  };

  const handleConnectorSelected = (connector: Connector) => {
    if (connector.type !== "browser") {
      clearBrowserConnectorConnectIntent();
    }
    onHide();
  };

  if (!show) return null;

  const overlay = (
    <div
      className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/50"
      onClick={handleHide}
      role="dialog"
      aria-modal
    >
      <div
        className={CONNECTOR_MODAL_DIALOG_CLASS}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${confirmModalHeader} tw-shrink-0`}>
          <h2 className="tw-m-0 tw-text-lg tw-font-semibold">
            Choose Connector
          </h2>
        </div>
        <div className={`${confirmModalBody} ${CONNECTOR_MODAL_BODY_CLASS}`}>
          {isBrowser ? (
            <ConnectorList
              connectors={otherConnectors}
              selected={handleConnectorSelected}
              className="tw-mb-3"
            />
          ) : (
            <>
              <ConnectSection
                title="Seed Wallet"
                open={openSection === "0"}
                onToggle={() => toggle("0")}
              >
                <ConnectorList
                  connectors={seedConnectors}
                  selected={handleConnectorSelected}
                />
                {seedConnectors.length === 0 && (
                  <div className="tw-text-center">
                    <p className="tw-m-0">
                      Create or import a seed wallet in 6529 Desktop Wallets
                      <br />
                      <Link
                        href="/core/core-wallets"
                        onClick={() => {
                          if (
                            window.location.pathname === "/core/core-wallets"
                          ) {
                            handleHide();
                          }
                        }}
                        className="tw-cursor-pointer tw-text-primary-400 tw-underline hover:tw-text-primary-300"
                      >
                        take me there
                      </Link>
                    </p>
                  </div>
                )}
              </ConnectSection>
              <ConnectSection
                title="Browser"
                open={openSection === "1"}
                onToggle={() => toggle("1")}
                className="tw-pt-3"
              >
                <ConnectorList
                  connectors={browserConnectors}
                  selected={handleConnectorSelected}
                />
              </ConnectSection>
              <ConnectSection
                title="Third-Party"
                open={openSection === "2"}
                onToggle={() => toggle("2")}
                className="tw-pb-3 tw-pt-3"
              >
                <ConnectorList
                  connectors={otherConnectors}
                  selected={handleConnectorSelected}
                />
              </ConnectSection>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(overlay, document.body);
  }
  return overlay;
}

function ConnectorList({
  connectors,
  selected,
  className = "",
}: Readonly<{
  connectors: Connector[];
  selected: (connector: Connector) => void;
  className?: string;
}>) {
  return (
    <div
      className={`tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-2 ${className}`.trim()}
    >
      {connectors.map((connector) => (
        <ConnectorSelector
          key={connector.id}
          connector={connector}
          selected={selected}
        />
      ))}
    </div>
  );
}

function ConnectSection({
  title,
  open,
  onToggle,
  children,
  className = "",
}: Readonly<{
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={onToggle}
        className="tw-flex tw-w-full tw-cursor-pointer tw-items-center tw-justify-between tw-rounded-lg tw-border-0 tw-bg-transparent tw-p-3 tw-text-left tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 desktop-hover:hover:tw-bg-iron-900"
      >
        <b>{title}</b>
        <span className="tw-text-iron-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="tw-mt-2 tw-p-3 tw-pt-0">{children}</div>}
    </div>
  );
}

function ConnectorSelector(
  props: Readonly<{
    connector: Connector;
    selected: (connector: Connector) => void;
  }>
) {
  const { connectAsync } = useConnect();
  const { open } = useAppKit();
  const {
    address: activeAddress,
    connectedAccounts,
    seizeSwitchConnectedAccount,
  } = useSeizeConnectContext();

  const imageSrc = getConnectorImage(props.connector);
  const isSeed = props.connector.type === "seed-wallet";
  const selectionState = isSeed
    ? getSeedWalletSelectionState({
        connectorAddress: props.connector.id,
        activeAddress,
        connectedAccountAddresses: connectedAccounts.map(
          (account) => account.address
        ),
      })
    : "available";
  const isActive = selectionState === "active";
  const isConnected = selectionState === "connected";

  const reportConnectionError = (connectionError: unknown) => {
    alert("Something went wrong");
    console.error("error", connectionError);
  };

  const onConnect = () => {
    if (isActive) {
      return;
    }

    if (isConnected) {
      try {
        seizeSwitchConnectedAccount(props.connector.id);
      } catch (connectionError) {
        reportConnectionError(connectionError);
        return;
      }
      props.selected(props.connector);
      return;
    }

    if (props.connector.type === "walletConnect") {
      void Promise.resolve(
        open({ view: "ConnectingWalletConnectBasic" })
      ).catch(reportConnectionError);
    } else {
      void connectAsync({ connector: props.connector }).catch(
        reportConnectionError
      );
    }
    props.selected(props.connector);
  };

  const ariaLabel = isActive
    ? t(CONNECTOR_MODAL_LOCALE, "header.connector.seedWallet.activeAria", {
        walletName: props.connector.name,
      })
    : isConnected
      ? t(CONNECTOR_MODAL_LOCALE, "header.connector.seedWallet.switchAria", {
          walletName: props.connector.name,
        })
      : undefined;

  return (
    <button
      type="button"
      onClick={onConnect}
      disabled={isActive}
      aria-label={ariaLabel}
      className={`tw-flex tw-w-full tw-items-center tw-justify-start tw-gap-3 tw-rounded-lg tw-border tw-border-solid tw-py-3 tw-pl-3 tw-pr-3 tw-text-left tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 disabled:tw-cursor-default disabled:tw-opacity-100 ${
        isActive
          ? "tw-border-success/30 tw-bg-iron-800"
          : "tw-cursor-pointer tw-border-iron-700 tw-bg-transparent desktop-hover:hover:tw-bg-iron-800"
      }`}
    >
      {imageSrc && (
        <Image
          fetchPriority="high"
          loading="eager"
          height={34}
          width={34}
          src={imageSrc}
          alt={props.connector.name}
          className={
            isSeed
              ? "tw-rounded-full tw-ring-1 tw-ring-inset tw-ring-iron-800"
              : ""
          }
        />
      )}
      <span className="tw-flex tw-min-w-0 tw-flex-col tw-items-start tw-gap-1">
        <span className="tw-max-w-full tw-truncate">
          {props.connector.name}
        </span>
        {isSeed && (
          <span className="tw-max-w-full tw-truncate tw-text-sm tw-text-iron-400">
            {formatAddress(props.connector.id)}
          </span>
        )}
      </span>
      {isSeed && isActive && (
        <span className="tw-ml-auto tw-inline-flex tw-flex-shrink-0 tw-items-center tw-gap-1 tw-whitespace-nowrap tw-rounded-full tw-border tw-border-solid tw-border-success/30 tw-bg-success/10 tw-px-2 tw-py-0.5 tw-text-[10px] tw-font-semibold tw-leading-4 tw-text-success">
          <span aria-hidden="true">✓</span>
          {t(CONNECTOR_MODAL_LOCALE, "header.connector.seedWallet.active")}
        </span>
      )}
      {isSeed && isConnected && (
        <span className="tw-ml-auto tw-inline-flex tw-flex-shrink-0 tw-items-center tw-gap-1 tw-whitespace-nowrap tw-rounded-full tw-border tw-border-solid tw-border-primary-400/30 tw-bg-primary-500/10 tw-px-2 tw-py-0.5 tw-text-[10px] tw-font-semibold tw-leading-4 tw-text-primary-300">
          {t(CONNECTOR_MODAL_LOCALE, "header.connector.seedWallet.switch")}
          <span aria-hidden="true">→</span>
        </span>
      )}
    </button>
  );
}

function getConnectorImage(connector: Connector): string {
  if (connector.type === "seed-wallet" && connector.icon) {
    return connector.icon;
  }
  const map: Record<string, string> = {
    MetaMask: "/metamask.svg",
    WalletConnect: "/walletconnect.svg",
    "Coinbase Wallet": "/coinbase.svg",
    "Base Account": "/coinbase.svg",
    Base: "/coinbase.svg",
    Safe: "/safe.svg",
    Chrome: "/chrome.svg",
    Firefox: "/firefox.svg",
    Brave: "/brave.svg",
    "Brave Wallet": "/brave.svg",
    "Rabby Wallet": "/rabby.png",
  };
  return map[connector.name] ?? connector.icon ?? "";
}
