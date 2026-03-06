"use client";

import {
  confirmModalBody,
  confirmModalHeader,
} from "@/components/shared/ConfirmModalShell";
import { isElectron } from "@/helpers";
import { formatAddress } from "@/helpers/Helpers";
import { useAppKit } from "@reown/appkit/react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Connector, useConnect, useConnectors } from "wagmi";

interface HeaderUserConnectModalProps {
  show: boolean;
  onHide: () => void;
}

export default function HeaderUserConnectModal({
  show,
  onHide,
}: Readonly<HeaderUserConnectModalProps>) {
  const connectors = useConnectors()
    .filter((c) => c.id !== "w3mAuth" && c.id !== "injected");

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

  const seedConnectors = connectors.flat().filter((c) => c.type === "seed-wallet");
  const browserConnectors = connectors.flat().filter((c) => c.type === "browser");

  const renderConnectors = (list: Connector[], extraClass = "") => (
    <div
      className={`tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-2 ${extraClass}`.trim()}
    >
      {list.map((c) => (
        <ConnectorSelector
          key={c.id}
          connector={c}
          selected={onHide}
        />
      ))}
    </div>
  );

  if (!show) return null;

  const overlay = (
    <div
      className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-black/50"
      onClick={onHide}
      role="dialog"
      aria-modal
    >
      <div
        className="tw-max-h-[90vh] tw-w-full tw-max-w-[400px] tw-overflow-auto tw-rounded-xl tw-bg-iron-950 tw-shadow-xl tw-ring-1 tw-ring-inset tw-ring-iron-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={confirmModalHeader}>
          <h2 className="tw-m-0 tw-text-lg tw-font-semibold">
            Choose Connector
          </h2>
        </div>
        <div className={`${confirmModalBody} tw-border-b-0`}>
          {isBrowser ? (
            renderConnectors(otherConnectors, "tw-mb-3")
          ) : (
            <>
              <ConnectSection
                title="Seed Wallet"
                open={openSection === "0"}
                onToggle={() => toggle("0")}
              >
                {renderConnectors(seedConnectors)}
                {seedConnectors.length === 0 && (
                  <div className="tw-text-center">
                    <p className="tw-m-0">
                      Create or import a seed wallet in 6529 Desktop Wallets
                      <br />
                      <Link
                        href="/core/core-wallets"
                        onClick={() => {
                          if (window.location.pathname === "/core/core-wallets") {
                            onHide();
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
                {renderConnectors(browserConnectors)}
              </ConnectSection>
              <ConnectSection
                title="Third-Party"
                open={openSection === "2"}
                onToggle={() => toggle("2")}
                className="tw-pb-3 tw-pt-3"
              >
                {renderConnectors(otherConnectors)}
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
        <span className="tw-text-iron-400">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="tw-mt-2 tw-p-3 tw-pt-0">
          {children}
        </div>
      )}
    </div>
  );
}

function ConnectorSelector(
  props: Readonly<{ connector: Connector; selected: () => void }>
) {
  const { connectAsync, error } = useConnect();
  const { open } = useAppKit();

  useEffect(() => {
    if (error) {
      alert("Something went wrong");
      console.error("error", error);
    }
  }, [error]);

  const onConnect = () => {
    if (props.connector.type === "walletConnect") {
      open({ view: "ConnectingWalletConnectBasic" });
    } else {
      connectAsync({ connector: props.connector });
    }
    props.selected();
  };

  const imageSrc = getConnectorImage(props.connector);
  const isSeed = props.connector.type === "seed-wallet";

  return (
    <button
      type="button"
      onClick={onConnect}
      className="tw-flex tw-w-full tw-cursor-pointer tw-items-center tw-justify-start tw-gap-3 tw-rounded-lg tw-border tw-border-solid tw-border-iron-700 tw-bg-transparent tw-py-3 tw-pl-3 tw-pr-3 tw-text-left tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 desktop-hover:hover:tw-bg-iron-800"
    >
      {imageSrc && (
        <Image
          fetchPriority="high"
          loading="eager"
          height={34}
          width={34}
          src={imageSrc}
          alt={props.connector.name}
          className={isSeed ? "tw-rounded-full tw-ring-1 tw-ring-inset tw-ring-iron-800" : ""}
        />
      )}
      <span className="tw-flex tw-flex-col tw-items-start tw-gap-1">
        <span>{props.connector.name}</span>
        {isSeed && (
          <span className="tw-text-sm tw-text-iron-400">
            {formatAddress(props.connector.id)}
          </span>
        )}
      </span>
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
