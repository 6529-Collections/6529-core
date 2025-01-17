import styles from "./SeedWallet.module.scss";
import { Container, Row, Col, Button } from "react-bootstrap";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  faCheckCircle,
  faCircleArrowLeft,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useToast } from "../../../contexts/ToastContext";
import { getRandomKey } from "../../../helpers";
import { MNEMONIC_NA } from "../../../../constants";
import { ethers } from "ethers";
import { CreateSeedWalletModal } from "./SeedWalletModal";

export default function SeedWalletImport() {
  const [isMnemonic, setIsMnemonic] = useState(true);

  return (
    <>
      <Container className="pt-5">
        <Row>
          <Col>
            <Link
              className="font-smaller d-flex align-items-center gap-2 decoration-none"
              href="/core/core-wallets"
            >
              <FontAwesomeIcon icon={faCircleArrowLeft} height={16} />
              Back to Core Wallets
            </Link>
          </Col>
        </Row>
        <Row className="pt-4">
          <Col>
            <h1>
              <span className="font-lightest">Import</span> Seed Wallet
            </h1>
          </Col>
        </Row>
        <Row className="pt-4">
          <Col>
            <Button
              variant={isMnemonic ? "info" : "outline-info"}
              onClick={() => setIsMnemonic(true)}
              className="btn-block"
            >
              Mnemonic
            </Button>
          </Col>
          <Col>
            <Button
              variant={!isMnemonic ? "info" : "outline-info"}
              onClick={() => setIsMnemonic(false)}
              className="btn-block"
            >
              Private Key
            </Button>
          </Col>
        </Row>
      </Container>
      {isMnemonic ? (
        <SeedWalletImportMnemonic />
      ) : (
        <SeedWalletImportPrivateKey />
      )}
    </>
  );
}

function SeedWalletImportMnemonic() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [phrase, setPhrase] = useState<string[]>(Array(12).fill(""));
  const [isReadonly, setIsReadonly] = useState(false);

  const [currentFocus, setCurrentFocus] = useState(0);

  const [error, setError] = useState("");
  const [validatedWallet, setValidatedWallet] = useState<
    ethers.Wallet | ethers.HDNodeWallet
  >();

  const clear = () => {
    setPhrase(Array(12).fill(""));
    setError("");
    setIsReadonly(false);
    setValidatedWallet(undefined);
    setCurrentFocus(0);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const validate = () => {
    setIsReadonly(true);
    try {
      const wallet = ethers.Wallet.fromPhrase(phrase.join(" "));
      setValidatedWallet(wallet);
    } catch (e: any) {
      setError(`Error: ${e.message}`);
    }
  };

  function isCompletePhrase() {
    return phrase.every((w) => w);
  }

  return (
    <Container className="pt-3 pb-5">
      <Row>
        {phrase.map((w, i) => (
          <Col xs={6} sm={4} md={3} className="pt-2 pb-2" key={getRandomKey()}>
            <Container className={`${styles.phrase}`}>
              <Row>
                <Col className="d-flex gap-2">
                  <span className="font-color-h font-lighter">{i + 1}</span>
                  <span>
                    <input
                      autoFocus={i === currentFocus}
                      type="text"
                      placeholder={`word ${i + 1}`}
                      value={w}
                      className={styles.importWalletWordInput}
                      onChange={(e) => {
                        const newPhrase = e.target.value;
                        if (/^[a-z]*$/.test(newPhrase)) {
                          setPhrase((prev) => {
                            const currentPhrase = [...prev];
                            currentPhrase[i] = newPhrase;
                            return currentPhrase;
                          });
                        } else {
                          showToast(
                            "Mnemonic word can only contain lowercase alphabet characters",
                            "error",
                            true
                          );
                        }
                      }}
                      onFocus={() => setCurrentFocus(i)}
                    />
                  </span>
                </Col>
              </Row>
            </Container>
          </Col>
        ))}
      </Row>
      <Row className="pt-4">
        <Col className="d-flex align-items-center justify-content-between">
          <Button
            variant="warning"
            onClick={clear}
            className="font-bolder"
            disabled={!phrase.some((w) => w) && !isCompletePhrase()}
          >
            Clear
          </Button>
          <Button
            variant="primary"
            disabled={!isCompletePhrase() || isReadonly}
            onClick={validate}
            className="font-bolder"
          >
            Validate
          </Button>
        </Col>
      </Row>
      {error && <ValidationError error={error} />}
      {validatedWallet && (
        <ValidatedWallet wallet={validatedWallet} mnemonic={phrase.join(" ")} />
      )}
    </Container>
  );
}

function SeedWalletImportPrivateKey() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [isReadonly, setIsReadonly] = useState(false);

  const [error, setError] = useState("");
  const [validatedWallet, setValidatedWallet] = useState<
    ethers.Wallet | ethers.HDNodeWallet
  >();

  const clear = () => {
    setPrivateKey("");
    setError("");
    setIsReadonly(false);
    setValidatedWallet(undefined);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const validate = () => {
    setIsReadonly(true);
    try {
      const wallet = new ethers.Wallet(privateKey);
      setValidatedWallet(wallet);
    } catch (e: any) {
      setError(`Error: ${e.message}`);
    }
  };

  return (
    <Container className="pt-3 pb-5">
      <Row>
        <Col className="pt-2 pb-2">
          <Container className={`${styles.phrase}`}>
            <Row>
              <Col className="d-flex gap-2">
                <input
                  ref={inputRef}
                  autoFocus
                  disabled={isReadonly}
                  type="text"
                  placeholder="private key"
                  value={privateKey}
                  className={styles.importWalletWordInput}
                  onChange={(e) => setPrivateKey(e.target.value)}
                />
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
      <Row className="pt-4">
        <Col className="d-flex align-items-center justify-content-between">
          <Button
            variant="warning"
            onClick={clear}
            className="font-bolder"
            disabled={!privateKey}
          >
            Clear
          </Button>
          <Button
            variant="primary"
            disabled={!privateKey || isReadonly}
            onClick={validate}
            className="font-bolder"
          >
            Validate
          </Button>
        </Col>
      </Row>
      {error && <ValidationError error={error} />}
      {validatedWallet && (
        <ValidatedWallet wallet={validatedWallet} mnemonic={MNEMONIC_NA} />
      )}
    </Container>
  );
}

function ValidationError(props: Readonly<{ error: string }>) {
  return (
    <Row className="pt-3">
      <Col xs={12}>{props.error}</Col>
      <Col xs={12}>- Clear the form and try again</Col>
    </Row>
  );
}

function ValidatedWallet(
  props: Readonly<{
    wallet: ethers.Wallet | ethers.HDNodeWallet;
    mnemonic: string;
  }>
) {
  return (
    <Row className="pt-4">
      <Col xs={12} className="d-flex align-items-center gap-2">
        <FontAwesomeIcon icon={faCheckCircle} height={22} color="#00ff00" />
        Private Key is Valid!
      </Col>
      <Col xs={12} className="pt-2">
        - Address: {props.wallet.address}
      </Col>
      <Col xs={12} className="pt-3">
        <ImportWallet wallet={props.wallet} mnemonic={props.mnemonic} />
      </Col>
    </Row>
  );
}

function ImportWallet(
  props: Readonly<{
    wallet: ethers.Wallet | ethers.HDNodeWallet;
    mnemonic: string;
  }>
) {
  const router = useRouter();
  const [showImportModal, setShowImportModal] = useState(false);

  return (
    <div className="d-flex gap-2">
      <CreateSeedWalletModal
        show={showImportModal}
        onHide={(refresh: boolean) => {
          setShowImportModal(false);
          if (refresh) {
            router.push("/core/core-wallets");
          }
        }}
        import={{
          address: props.wallet.address,
          mnemonic: props.mnemonic,
          privateKey: props.wallet.privateKey,
        }}
      />
      <Button
        variant="primary"
        onClick={() => setShowImportModal(true)}
        className="d-flex align-items-center gap-2"
      >
        <FontAwesomeIcon icon={faPlusCircle} height={16} /> Import Wallet
      </Button>
    </div>
  );
}
