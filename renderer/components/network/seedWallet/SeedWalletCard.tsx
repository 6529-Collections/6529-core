import styles from "./SeedWallet.module.scss";
import { Container, Row, Col } from "react-bootstrap";
import { ISeedWallet } from "../../../../shared/types";
import Link from "next/link";
import { formatNameForUrl } from "../../nextGen/nextgen_helpers";
import { formatAddress } from "../../../helpers/Helpers";

export default function SeedWalletCard(
  props: Readonly<{
    wallet: ISeedWallet;
  }>
) {
  const path = formatNameForUrl(props.wallet.name);

  return (
    <Link href={`/network/seed-wallets/${path}`} className="decoration-none">
      <Container className={styles.seedWalletCard}>
        <Row>
          <Col className="d-flex align-items-center gap-2">
            {props.wallet.name}
          </Col>
        </Row>
        <Row className="pt-2">
          <Col className="font-smaller font-lighter text-break">
            {props.wallet.address}
          </Col>
        </Row>
      </Container>
    </Link>
  );
}
