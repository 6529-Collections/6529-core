"use client";

import { useSeizeConnectContext } from "@/components/auth/SeizeConnectContext";
import { useConfirm } from "@/contexts/ConfirmContext";
import { useToast } from "@/contexts/ToastContext";
import { deleteSeedWallet, getSeedWallet } from "@/electron";
import { MNEMONIC_NA } from "@/electron-constants";
import { getRandomKey, openInExternalBrowser } from "@/helpers";
import {
  areEqualAddresses,
  fromGWEI,
  getAddressEtherscanLink,
} from "@/helpers/Helpers";
import { decryptData } from "@/shared/encrypt";
import { ISeedWallet } from "@/shared/types";
import {
  faCircleArrowLeft,
  faCopy,
  faExternalLink,
  faEye,
  faEyeSlash,
  faFileDownload,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Tooltip } from "react-tooltip";
import { sepolia } from "viem/chains";
import { useBalance, useChainId } from "wagmi";
import DotLoader, { Spinner } from "../../dotLoader/DotLoader";
import { UnlockSeedWalletModal } from "./SeedWalletModal";

export default function SeedWallet(
  props: Readonly<{
    address: string;
  }>
) {
  const router = useRouter();
  const chainId = useChainId();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();
  const account = useSeizeConnectContext();

  const balance = useBalance({
    address: props.address as `0x${string}`,
    chainId: chainId,
  });

  const [mnemonicAvailable, setMnemonicAvailable] = useState(false);

  const [seedWallet, setSeedWallet] = useState<ISeedWallet | null>(null);
  const [phrase, setPhrase] = useState<string[]>(Array(12).fill(""));
  const [privateKey, setPrivateKey] = useState("");
  const [fetching, setFetching] = useState(true);

  const [isRevealingPhrase, setIsRevealingPhrase] = useState(false);
  const [revealPhrase, setRevealPhrase] = useState(false);
  const [isRevealingPrivateKey, setIsRevealingPrivateKey] = useState(false);
  const [revealPrivateKey, setRevealPrivateKey] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);

  function setEncryptedPhrase() {
    setPhrase(Array(12).fill("x".repeat(8)));
  }

  function setEncryptedPrivateKey() {
    setPrivateKey("0x" + "x".repeat(64));
  }

  const fetchWallet = () => {
    getSeedWallet(props.address)
      .then((data) => {
        setSeedWallet(data.data);
        setEncryptedPhrase();
        setEncryptedPrivateKey();
        setMnemonicAvailable(data.data.mnemonic !== MNEMONIC_NA);
        setFetching(false);
      })
      .catch((e) => {
        console.error("Error fetching wallet", e);
        setFetching(false);
      });
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  const doDownload = (
    wallet: ISeedWallet,
    decryptedMnemonic: string,
    decryptedPrivateKey: string
  ) => {
    let content = `Name: ${wallet.name}\n\n`;
    content += `Address: ${wallet.address}\n\n`;
    content += `Mnemonic: ${decryptedMnemonic}\n\n`;
    content += `Private Key: ${decryptedPrivateKey}\n\n`;

    const fileName = `${wallet.name}-6529CORE.txt`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doDelete = useCallback(
    async (name: string, address: string) => {
      if (areEqualAddresses(address, account.address)) {
        showToast(
          "You are currently connected with this wallet - Disconnect first!",
          "error"
        );
        return;
      }
      const data = await deleteSeedWallet(address);
      if (data.error) {
        console.error(data.error);
        showToast(`Error deleting wallet - ${data.error}`, "error");
      } else {
        router.push("/core/core-wallets");
        showToast(`Wallet '${name}' deleted successfully`, "success");
      }
    },
    [account.address]
  );

  const deleteWallet = (name: string, address: string) => {
    showConfirm(
      "Confirm Delete Wallet",
      `Are you sure you want to delete your wallet '${seedWallet?.name}'?`,
      () => doDelete(name, address)
    );
  };

  const printTooltip = (id: string, content: string) => {
    return (
      <Tooltip
        id={id}
        place="top"
        style={{
          backgroundColor: "#1F2937",
          color: "white",
          padding: "4px 8px",
        }}
        openEvents={{ mouseenter: true }}
        closeEvents={{ mouseleave: true, blur: true, click: true }}
      >
        {content}
      </Tooltip>
    );
  };

  if (fetching) {
    return (
      <div className="tw-py-5">
        <div className="tw-flex tw-gap-2">
          <span>Fetching wallet</span>
          <Spinner />
        </div>
      </div>
    );
  }

  if (!seedWallet) {
    return (
      <div className="tw-py-5">
        Wallet with address <b>{props.address}</b> not found.
      </div>
    );
  }

  return (
    <div className="tw-py-5">
      <div>
        <Link
          className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-inherit tw-no-underline hover:tw-underline"
          href="/core/core-wallets"
        >
          <FontAwesomeIcon icon={faCircleArrowLeft} height={16} />
          Back to 6529 Desktop Wallets
        </Link>
      </div>
      <div className="tw-mt-6 tw-rounded-xl tw-bg-iron-950 tw-p-5 tw-ring-1 tw-ring-inset tw-ring-iron-800">
        <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
          <h3 className="tw-m-0 tw-flex tw-items-center tw-gap-2">
            <Image
              className="tw-size-12 tw-rounded-full tw-p-0.5 tw-ring-1 tw-ring-inset tw-ring-iron-800"
              fetchPriority="high"
              loading="eager"
              height={50}
              width={50}
              src={`https://robohash.org/${props.address}.png`}
              alt={props.address}
            />
            {seedWallet.name}
            {seedWallet.imported ? (
              <span className="tw-text-iron-400"> (imported)</span>
            ) : null}
          </h3>
          <span>
            Balance:{" "}
            {balance.isFetching ? (
              <DotLoader />
            ) : balance.data ? (
              <>
                {fromGWEI(Number(balance.data.value))} {balance.data?.symbol}
                {chainId === sepolia.id && (
                  <span className="tw-text-iron-400"> (sepolia)</span>
                )}
              </>
            ) : (
              <>Error</>
            )}
          </span>
        </div>
        <div className="tw-mt-4 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-2">
          <span>
            Wallet Address:{" "}
            <span className="tw-text-lg tw-font-bold">
              {seedWallet.address.toLowerCase()}
            </span>
          </span>
          <span className="tw-flex tw-items-center tw-gap-2">
            <FontAwesomeIcon
              className="tw-cursor-pointer tw-select-none"
              data-tooltip-id="view-on-etherscan-tooltip"
              icon={faExternalLink}
              height={22}
              onClick={() =>
                openInExternalBrowser(
                  getAddressEtherscanLink(chainId, seedWallet.address)
                )
              }
            />
            {printTooltip("view-on-etherscan-tooltip", "View on Etherscan")}

            <FontAwesomeIcon
              className="tw-cursor-pointer tw-select-none"
              data-tooltip-id="download-recovery-file-tooltip"
              icon={faFileDownload}
              height={22}
              onClick={() => setIsDownloading(true)}
            />
            {printTooltip(
              "download-recovery-file-tooltip",
              "Download Recovery File"
            )}
            <UnlockSeedWalletModal
              address={seedWallet.address}
              address_hashed={seedWallet.address_hashed}
              show={isDownloading}
              onHide={() => setIsDownloading(false)}
              onUnlock={(pass: string) => {
                decryptData(
                  seedWallet.address,
                  seedWallet.private_key,
                  pass
                ).then(async (decryptedPrivateKey) => {
                  let decryptedMnemonic = seedWallet.mnemonic;
                  if (decryptedMnemonic !== MNEMONIC_NA) {
                    decryptedMnemonic = await decryptData(
                      seedWallet.address,
                      seedWallet.mnemonic,
                      pass
                    );
                  }
                  doDownload(
                    seedWallet,
                    decryptedMnemonic,
                    decryptedPrivateKey
                  );
                });
              }}
            />

            <FontAwesomeIcon
              className="tw-cursor-pointer tw-select-none"
              data-tooltip-id="copy-address-tooltip"
              icon={faCopy}
              height={22}
              onClick={() => {
                navigator.clipboard.writeText(seedWallet.address);
                setAddressCopied(true);
                setTimeout(() => {
                  setAddressCopied(false);
                }, 1500);
              }}
            />
            {printTooltip(
              "copy-address-tooltip",
              addressCopied ? "Copied!" : "Copy address to clipboard"
            )}
          </span>
        </div>
        <div className="tw-mt-5 tw-flex tw-items-center tw-justify-between">
          <span>Mnemonic Phrase</span>
          {mnemonicAvailable && (
            <span className="tw-flex tw-items-center tw-gap-3">
              <FontAwesomeIcon
                className="tw-cursor-pointer tw-select-none"
                data-tooltip-id="reveal-phrase-tooltip"
                icon={revealPhrase ? faEye : faEyeSlash}
                height={22}
                onClick={() => {
                  if (revealPhrase) {
                    setRevealPhrase(false);
                    setEncryptedPhrase();
                  } else {
                    setIsRevealingPhrase(true);
                  }
                }}
              />
              {printTooltip(
                "reveal-phrase-tooltip",
                revealPhrase ? "Hide" : "Reveal"
              )}
              <UnlockSeedWalletModal
                address={seedWallet.address}
                address_hashed={seedWallet.address_hashed}
                show={isRevealingPhrase}
                onHide={() => setIsRevealingPhrase(false)}
                onUnlock={(pass: string) => {
                  decryptData(
                    seedWallet.address,
                    seedWallet.mnemonic,
                    pass
                  ).then((decryptedPhrase) => {
                    setPhrase(decryptedPhrase.split(" "));
                    setRevealPhrase(true);
                  });
                }}
              />
              {revealPhrase && (
                <>
                  <FontAwesomeIcon
                    className="tw-cursor-pointer tw-select-none"
                    data-tooltip-id="copy-mnemonic-tooltip"
                    icon={faCopy}
                    height={22}
                    onClick={() => {
                      navigator.clipboard.writeText(phrase.join(" "));
                      setMnemonicCopied(true);
                      setTimeout(() => {
                        setMnemonicCopied(false);
                      }, 1500);
                    }}
                  />
                  {printTooltip(
                    "copy-mnemonic-tooltip",
                    mnemonicCopied ? "Copied!" : "Copy to clipboard"
                  )}
                </>
              )}
            </span>
          )}
        </div>
        <div className="tw-mt-2 tw-grid tw-grid-cols-2 tw-gap-2 sm:tw-grid-cols-4">
          {mnemonicAvailable ? (
            phrase.map((w, i) => (
              <SeedWalletPhraseWord
                index={i + 1}
                word={w}
                hidden={!revealPhrase}
                key={getRandomKey()}
              />
            ))
          ) : (
            <span className="tw-text-iron-400">
              Mnemonic phrase not available for this wallet
            </span>
          )}
        </div>
        <div className="tw-mt-4 tw-flex tw-items-center tw-justify-between">
          <span>Private Key</span>
          <span className="tw-flex tw-items-center tw-gap-3">
            <FontAwesomeIcon
              className="tw-cursor-pointer tw-select-none"
              data-tooltip-id="reveal-private-key-tooltip"
              icon={revealPrivateKey ? faEye : faEyeSlash}
              height={22}
              onClick={() => {
                if (revealPrivateKey) {
                  setRevealPrivateKey(false);
                  setEncryptedPrivateKey();
                } else {
                  setIsRevealingPrivateKey(true);
                }
              }}
            />
            {printTooltip(
              "reveal-private-key-tooltip",
              revealPrivateKey ? "Hide" : "Reveal"
            )}
            <UnlockSeedWalletModal
              address={seedWallet.address}
              address_hashed={seedWallet.address_hashed}
              show={isRevealingPrivateKey}
              onHide={() => setIsRevealingPrivateKey(false)}
              onUnlock={(pass: string) => {
                decryptData(
                  seedWallet.address,
                  seedWallet.private_key,
                  pass
                ).then((decryptedPrivateKey) => {
                  setPrivateKey(decryptedPrivateKey);
                  setRevealPrivateKey(true);
                });
              }}
            />
            {revealPrivateKey && (
              <>
                <FontAwesomeIcon
                  className="tw-cursor-pointer tw-select-none"
                  data-tooltip-id="copy-private-key-tooltip"
                  icon={faCopy}
                  height={22}
                  onClick={() => {
                    navigator.clipboard.writeText(privateKey);
                    setPrivateKeyCopied(true);
                    setTimeout(() => {
                      setPrivateKeyCopied(false);
                    }, 1500);
                  }}
                />
                {printTooltip(
                  "copy-private-key-tooltip",
                  privateKeyCopied ? "Copied!" : "Copy to clipboard"
                )}
              </>
            )}
          </span>
        </div>
        <div className="tw-mt-2">
          <SeedWalletPhraseWord
            word={privateKey}
            hidden={!revealPrivateKey}
            full_width={true}
          />
        </div>
        <div className="tw-mt-5 tw-flex tw-items-center tw-gap-2">
          <button
            type="button"
            onClick={() => deleteWallet(seedWallet.name, seedWallet.address)}
            className="tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-[#dc2626] tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-red focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950 desktop-hover:hover:tw-bg-[#ef4444]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function SeedWalletPhraseWord(
  props: Readonly<{
    index?: number;
    word: string;
    hidden: boolean;
    full_width?: boolean;
  }>
) {
  return (
    <div
      className={
        props.full_width ? "tw-w-full tw-py-2" : "tw-w-full tw-min-w-0 tw-py-2"
      }
    >
      <div className="tw-rounded-xl tw-p-4 tw-text-lg tw-ring-1 tw-ring-inset tw-ring-iron-800">
        <div className="tw-flex tw-select-none tw-gap-2">
          {props.index != null && (
            <span className="tw-shrink-0 tw-font-light tw-text-iron-400">
              {props.index}
            </span>
          )}
          <span
            className={`${props.hidden ? "tw-select-none tw-blur" : ""} ${props.full_width ? "tw-break-all" : "tw-overflow-hidden tw-text-ellipsis tw-whitespace-nowrap"}`}
          >
            {props.word}
          </span>
        </div>
      </div>
    </div>
  );
}
