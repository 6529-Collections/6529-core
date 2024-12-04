import styles from "./SeedWallet.module.scss";
import { useCallback, useEffect, useState } from "react";
import { Container, Row, Col, Button } from "react-bootstrap";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { getSeedWallets, createSeedWallet } from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";
import { ISeedWallet } from "../../../../shared/types";
import SeedWalletCard from "./SeedWalletCard";
import { useRouter } from "next/router";
import { mainnet } from "viem/chains";
import { CreateSeedWalletModal } from "./SeedWalletModal";

export const SEED_WALLETS_NETWORK = mainnet;

export default function SeedWallets() {
  const router = useRouter();
  const { showToast } = useToast();
  const [seedWallets, setSeedWallets] = useState<ISeedWallet[]>([]);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchWallets = () => {
    getSeedWallets().then((data) => {
      setSeedWallets(data.data);
    });
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  function printCreateRow() {
    return (
      <Container className={seedWallets.length > 0 ? "pt-5" : ""}>
        <Row>
          <Col className="d-flex align-items-center gap-3">
            <CreateSeedWalletModal
              show={showCreateModal}
              onHide={(refresh: boolean) => {
                setShowCreateModal(false);
                if (refresh) {
                  fetchWallets();
                }
              }}
            />
            <Button
              variant="primary"
              onClick={() => setShowCreateModal(true)}
              className="d-flex align-items-center gap-2">
              <FontAwesomeIcon icon={faPlusCircle} height={16} /> Create Wallet
            </Button>
            <Button
              variant="success"
              onClick={() => router.push("/core/seed-wallets/import-wallet")}
              className="d-flex align-items-center gap-2">
              <FontAwesomeIcon icon={faPlusCircle} height={16} /> Import Wallet
            </Button>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <>
      <Container className="pt-4 pb-4">
        <Row className="pt-2 pb-4">
          <Col className="d-flex align-items-center justify-content-between gap-2">
            <h1>
              <span className="font-lightest">Seed</span> Wallets
            </h1>
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
