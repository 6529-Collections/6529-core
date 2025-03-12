import styles from "./SeedWallet.module.scss";
import {
  faCircleArrowLeft,
  faCopy,
  faExternalLink,
  faEye,
  faEyeSlash,
  faFileDownload,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Tippy from "@tippyjs/react";
import { Container, Row, Col, Button } from "react-bootstrap";
import { ISeedWallet } from "../../../../shared/types";
import { getRandomKey, openInExternalBrowser } from "../../../helpers";
import { useCallback, useEffect, useState } from "react";
import { deleteSeedWallet, getSeedWallet } from "../../../electron";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useToast } from "../../../contexts/ToastContext";
import DotLoader, { Spinner } from "../../dotLoader/DotLoader";
import { useRouter } from "next/router";
import Link from "next/link";
import { MNEMONIC_NA } from "../../../../constants";
import { useBalance, useChainId } from "wagmi";
import { sepolia } from "viem/chains";
import {
  areEqualAddresses,
  fromGWEI,
  getAddressEtherscanLink,
} from "../../../helpers/Helpers";
import Image from "next/image";
import { UnlockSeedWalletModal } from "./SeedWalletModal";
import { decryptData } from "../../../../shared/encrypt";
import { useSeizeConnectContext } from "../../auth/SeizeConnectContext";

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

  if (fetching) {
    return (
      <Container className="pt-5 pb-5">
        <Row>
          <Col className="d-flex gap-2">
            <span>Fetching wallet</span>
            <Spinner />
          </Col>
        </Row>
      </Container>
    );
  }

  if (!seedWallet) {
    return (
      <Container className="pt-5 pb-5">
        <Row>
          <Col>
            Wallet with address <b>{props.address}</b> not found.
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container className="pt-5 pb-5">
      <Row>
        <Col>
          <Link
            className="font-smaller d-flex align-items-center gap-2 decoration-none"
            href="/core/core-wallets">
            <FontAwesomeIcon icon={faCircleArrowLeft} height={16} />
            Back to Core Wallets
          </Link>
        </Col>
      </Row>
      <Row className="pt-4">
        <Col className="d-flex align-items-center justify-content-between">
          <h3 className="mb-0 d-flex align-items-center gap-2">
            <Image
              className={styles.seedWalletAvatar}
              fetchPriority="high"
              loading="eager"
              height={50}
              width={50}
              src={`https://robohash.org/${props.address}.png`}
              alt={props.address}
            />
            {seedWallet.name}
            {seedWallet.imported ? (
              <span className="font-color-h"> (imported)</span>
            ) : (
              <></>
            )}
          </h3>
          <span>
            Balance:{" "}
            {balance.isFetching ? (
              <DotLoader />
            ) : balance.data ? (
              <>
                {fromGWEI(Number(balance.data.value)).toLocaleString()}{" "}
                {balance.data?.symbol}
                {chainId === sepolia.id && (
                  <span className="font-color-h"> (sepolia)</span>
                )}
              </>
            ) : (
              <>Error</>
            )}
          </span>
        </Col>
      </Row>
      <Row className="pt-4">
        <Col className="d-flex align-items-center gap-2 justify-content-between">
          <span>
            Wallet Address:{" "}
            <span className="font-larger font-bolder">
              {seedWallet.address.toLowerCase()}
            </span>
          </span>
          <span className="d-flex align-items-center gap-2">
            <Tippy content={"View on Etherscan"} placement="top" theme="light">
              <FontAwesomeIcon
                className="cursor-pointer unselectable"
                icon={faExternalLink}
                height={22}
                onClick={() =>
                  openInExternalBrowser(
                    getAddressEtherscanLink(chainId, seedWallet.address)
                  )
                }
              />
            </Tippy>
            <Tippy
              content={"Download Recovery File"}
              placement="top"
              theme="light">
              <FontAwesomeIcon
                className="cursor-pointer unselectable"
                icon={faFileDownload}
                height={22}
                onClick={() => setIsDownloading(true)}
              />
            </Tippy>
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
            <Tippy
              content={addressCopied ? "Copied!" : "Copy address to clipboard"}
              hideOnClick={false}
              placement="top"
              theme="light">
              <FontAwesomeIcon
                className="cursor-pointer unselectable"
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
            </Tippy>
          </span>
        </Col>
      </Row>
      <Row className="pt-5">
        <Col className="d-flex align-items-center justify-content-between">
          <span>Mnemonic Phrase</span>
          {mnemonicAvailable && (
            <span className="d-flex gap-3 align-items-center">
              <Tippy
                hideOnClick={true}
                content={revealPhrase ? "Hide" : "Reveal"}
                placement="top"
                theme="light">
                <FontAwesomeIcon
                  className="cursor-pointer unselectable"
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
              </Tippy>
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
                <Tippy
                  content={mnemonicCopied ? "Copied!" : "Copy to clipboard"}
                  hideOnClick={false}
                  placement="top"
                  theme="light">
                  <FontAwesomeIcon
                    className="cursor-pointer unselectable"
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
                </Tippy>
              )}
            </span>
          )}
        </Col>
      </Row>
      <Row className="pt-2">
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
          <Col className="font-color-h">
            Mnemonic phrase not available for this wallet
          </Col>
        )}
      </Row>
      <Row className="pt-4">
        <Col className="d-flex align-items-center justify-content-between">
          <span>Private Key</span>
          <span className="d-flex gap-3 align-items-center">
            <Tippy
              content={revealPrivateKey ? "Hide" : "Reveal"}
              placement="top"
              theme="light">
              <FontAwesomeIcon
                className="cursor-pointer unselectable"
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
            </Tippy>
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
              <Tippy
                content={privateKeyCopied ? "Copied!" : "Copy to clipboard"}
                hideOnClick={false}
                placement="top"
                theme="light">
                <FontAwesomeIcon
                  className="cursor-pointer unselectable"
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
              </Tippy>
            )}
          </span>
        </Col>
      </Row>
      <Row className="pt-2">
        <SeedWalletPhraseWord
          word={privateKey}
          hidden={!revealPrivateKey}
          full_width={true}
        />
      </Row>
      <Row className="pt-5">
        <Col className="d-flex align-items-center gap-2">
          <Button
            variant="danger"
            onClick={() => deleteWallet(seedWallet.name, seedWallet.address)}>
            Delete
          </Button>
        </Col>
      </Row>
    </Container>
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
    <Col
      xs={props.full_width ? 12 : 6}
      sm={props.full_width ? 12 : 4}
      md={props.full_width ? 12 : 3}
      className="pt-2 pb-2">
      <Container className={styles.phrase}>
        <Row>
          <Col className="d-flex gap-2 unselectable">
            {props.index && (
              <span className="font-color-h font-lighter">{props.index}</span>
            )}
            <span className={`text-break ${props.hidden ? styles.blurry : ""}`}>
              {props.word}
            </span>
          </Col>
        </Row>
      </Container>
    </Col>
  );
}
