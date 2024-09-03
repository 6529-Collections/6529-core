import styles from "./SeedWallet.module.scss";
import { useCallback, useEffect, useState } from "react";
import { Container, Row, Col, Button } from "react-bootstrap";
import {
  faCheckCircle,
  faMinusCircle,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getSeedWallets, createSeedWallet } from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";
import { ISeedWallet } from "../../../../shared/types";
import SeedWalletCard from "./SeedWalletCard";

export default function SeedWallets() {
  const { showToast } = useToast();
  const [seedWallets, setSeedWallets] = useState<ISeedWallet[]>([]);

  const [newWalletName, setNewWalletName] = useState("");

  const fetchWallets = () => {
    getSeedWallets().then((data) => {
      console.log("i am data", data);
      setSeedWallets(data.data);
    });
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  const create = useCallback(async (name: string) => {
    const data = await createSeedWallet(name);

    if (data.error) {
      showToast(`Error creating wallet - ${data.data}`, "error");
    } else {
      showToast(
        "Wallet created successfully - Make a note of your mnemonic phrase immediately!",
        "success"
      );
      setNewWalletName("");
      fetchWallets();
    }
  }, []);

  function printCreateRow() {
    return (
      <Container className={seedWallets.length > 0 ? "pt-5" : ""}>
        <Row>
          <Col className="d-flex align-items-center gap-2">
            <input
              type="text"
              placeholder="Wallet Name"
              value={newWalletName}
              className={styles.newWalletInput}
              onChange={(e) => setNewWalletName(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={() => create(newWalletName)}
              disabled={!newWalletName}
              className="d-flex align-items-center gap-2">
              <FontAwesomeIcon icon={faPlusCircle} height={16} /> Create Wallet
            </Button>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <Container className="pt-4 pb-4 no-padding">
        <Row className="pt-2 pb-4">
          <Col className="d-flex align-items-center justify-content-between gap-2">
            <h2>Modules - Seed Wallets</h2>
            {seedWallets.length > 0 ? (
              <FontAwesomeIcon icon={faCheckCircle} height={30} color="green" />
            ) : (
              <FontAwesomeIcon icon={faMinusCircle} height={30} color="grey" />
            )}
          </Col>
        </Row>
      </Container>
      <Container>
        <Row>
          {seedWallets.map((s) => (
            <Col xs={12} sm={6} md={4} key={s.address} className="pb-3">
              <SeedWalletCard wallet={s} />
            </Col>
          ))}
        </Row>
      </Container>
      {printCreateRow()}
    </>
  );
}
