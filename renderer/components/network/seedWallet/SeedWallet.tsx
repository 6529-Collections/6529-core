import styles from "./SeedWallet.module.scss";
import { faCopy, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Tippy from "@tippyjs/react";
import { Container, Row, Col, Button } from "react-bootstrap";
import { ISeedWallet } from "../../../../shared/types";
import { getRandomKey } from "../../../helpers";
import { useCallback, useEffect, useState } from "react";
import { deleteSeedWallet, getSeedWallet } from "../../../electron";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useToast } from "../../../contexts/ToastContext";
import { Spinner } from "../../dotLoader/DotLoader";
import { useRouter } from "next/router";

export default function SeedWallet(
  props: Readonly<{
    wallet_name: string;
  }>
) {
  const parsedName = props.wallet_name.replaceAll("-", " ");
  const router = useRouter();
  const { showConfirm } = useConfirm();
  const { showToast } = useToast();

  const [seedWallet, setSeedWallet] = useState<ISeedWallet | null>(null);
  const [fetching, setFetching] = useState(true);

  const [revealPhrase, setRevealPhrase] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [mnemonicCopied, setMnemonicCopied] = useState(false);

  const fetchWallet = () => {
    getSeedWallet(parsedName)
      .then((data) => {
        setSeedWallet(data.data);
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

  const doDelete = useCallback(async (name: string) => {
    const data = await deleteSeedWallet(name);
    if (data.error) {
      console.error(data.error);
      showToast(`Error deleting wallet - ${data.error}`, "error");
    } else {
      showToast(`Wallet '${name}' deleted successfully`, "success");
      router.push("/network/seed-wallets");
    }
  }, []);

  const deleteWallet = (name: string) => {
    showConfirm(
      "Confirm Delete Wallet",
      "Are you sure you want to delete your wallet?",
      () => doDelete(name)
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
            Wallet with name <b>{parsedName}</b> not found.
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container className="pt-5 pb-5">
      <Row>
        <Col className="font-larger font-bolder">{seedWallet.name}</Col>
      </Row>
      <Row className="pt-3">
        <Col className="d-flex align-items-center gap-2">
          Wallet Address:{" "}
          <span className="font-larger">
            <b>{seedWallet.address}</b>
          </span>
          <Tippy
            content={addressCopied ? "Copied!" : "Copy to clipboard"}
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
        </Col>
      </Row>
      <Row className="pt-3">
        <Col className="d-flex align-items-center justify-content-between">
          <span>Mnemonic Phrase</span>
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
        </Col>
      </Row>
      <Row className="pt-2">
        {seedWallet.mnemonic.split(" ").map((w, i) => (
          <CustomWalletPhraseWord
            index={i + 1}
            word={w}
            hidden={!revealPhrase}
            key={getRandomKey()}
          />
        ))}
      </Row>
      <Row className="pt-5">
        <Col className="d-flex align-items-center gap-2">
          <Button
            variant="danger"
            onClick={() => deleteWallet(seedWallet.name)}>
            Delete
          </Button>
        </Col>
      </Row>
    </Container>
  );
}

function CustomWalletPhraseWord(
  props: Readonly<{ index: number; word: string; hidden: boolean }>
) {
  return (
    <Col xs={6} sm={4} md={3} className="pt-2 pb-2">
      <Container
        className={`${styles.phrase} ${props.hidden ? styles.blurry : ""}`}>
        <Row>
          <Col className="d-flex gap-2">
            <span className="font-color-h font-lighter">{props.index}</span>
            <span>{props.word}</span>
          </Col>
        </Row>
      </Container>
    </Col>
  );
}
