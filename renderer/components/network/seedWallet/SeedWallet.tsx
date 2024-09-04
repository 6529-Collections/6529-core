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
import { getAddressEtherscanLink } from "../../../helpers/Helpers";
import Image from "next/image";

export default function SeedWallet(
  props: Readonly<{
    address: string;
  }>
) {
  const router = useRouter();
  const chainId = useChainId();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();

  const balance = useBalance({
    address: props.address as `0x${string}`,
    chainId: chainId,
  });

  const [mnemonicAvailable, setMnemonicAvailable] = useState(false);

  const [seedWallet, setSeedWallet] = useState<ISeedWallet | null>(null);
  const [fetching, setFetching] = useState(true);

  const [revealPhrase, setRevealPhrase] = useState(false);
  const [revealPrivateKey, setRevealPrivateKey] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);

  const fetchWallet = () => {
    getSeedWallet(props.address)
      .then((data) => {
        setSeedWallet(data.data);
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

  const doDownload = (wallet: ISeedWallet) => {
    let content = `Name: ${wallet.name}\n\n`;
    content += `Address: ${wallet.address}\n\n`;
    if (wallet.mnemonic !== MNEMONIC_NA) {
      content += `Mnemonic: ${wallet.mnemonic}\n\n`;
    }
    content += `Private Key: ${wallet.private_key}\n\n`;

    const fileName = `${wallet.name}-6529CORE.txt`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doDelete = useCallback(async (name: string, address: string) => {
    const data = await deleteSeedWallet(address);
    if (data.error) {
      console.error(data.error);
      showToast(`Error deleting wallet - ${data.error}`, "error");
    } else {
      showToast(`Wallet '${name}' deleted successfully`, "success");
      router.push("/network/seed-wallets");
    }
  }, []);

  const deleteWallet = (name: string, address: string) => {
    showConfirm(
      "Confirm Delete Wallet",
      "Are you sure you want to delete your wallet?",
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
            href="/network/seed-wallets">
            <FontAwesomeIcon icon={faCircleArrowLeft} height={16} />
            Back to Seed Wallets
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
                {Number(balance.data.value)} {balance.data?.symbol}
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
            <Tippy
              content={"View on Etherscan"}
              hideOnClick={false}
              placement="top"
              theme="light">
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
              hideOnClick={false}
              placement="top"
              theme="light">
              <FontAwesomeIcon
                className="cursor-pointer unselectable"
                icon={faFileDownload}
                height={22}
                onClick={() => doDownload(seedWallet)}
              />
            </Tippy>
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
                content={revealPhrase ? "Hide" : "Reveal"}
                hideOnClick={false}
                placement="top"
                theme="light">
                <FontAwesomeIcon
                  className="cursor-pointer unselectable"
                  icon={revealPhrase ? faEye : faEyeSlash}
                  height={22}
                  onClick={() => setRevealPhrase(!revealPhrase)}
                />
              </Tippy>
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
                    navigator.clipboard.writeText(seedWallet.mnemonic);
                    setMnemonicCopied(true);
                    setTimeout(() => {
                      setMnemonicCopied(false);
                    }, 1500);
                  }}
                />
              </Tippy>
            </span>
          )}
        </Col>
      </Row>
      <Row className="pt-2">
        {mnemonicAvailable ? (
          seedWallet.mnemonic
            .split(" ")
            .map((w, i) => (
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
              hideOnClick={false}
              placement="top"
              theme="light">
              <FontAwesomeIcon
                className="cursor-pointer unselectable"
                icon={revealPrivateKey ? faEye : faEyeSlash}
                height={22}
                onClick={() => setRevealPrivateKey(!revealPrivateKey)}
              />
            </Tippy>
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
                  navigator.clipboard.writeText(seedWallet.private_key);
                  setPrivateKeyCopied(true);
                  setTimeout(() => {
                    setPrivateKeyCopied(false);
                  }, 1500);
                }}
              />
            </Tippy>
          </span>
        </Col>
      </Row>
      <Row className="pt-2">
        <SeedWalletPhraseWord
          word={seedWallet.private_key}
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
      <Container
        className={`${styles.phrase} ${props.hidden ? styles.blurry : ""}`}>
        <Row>
          <Col className="d-flex gap-2">
            {props.index && (
              <span className="font-color-h font-lighter">{props.index}</span>
            )}
            <span className="text-break">{props.word}</span>
          </Col>
        </Row>
      </Container>
    </Col>
  );
}
