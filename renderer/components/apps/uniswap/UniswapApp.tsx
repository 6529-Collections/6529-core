import { Container, Row, Col } from "react-bootstrap";
import styles from "./UniswapApp.module.scss";
import Image from "next/image";

export default function UniswapApp() {
  return (
    <Container fluid className={styles.mainContainer}>
      <Row>
        <Col>
          <Container className="pt-4">
            <Row>
              <Col className="d-flex align-items-center gap-3">
                <div className="d-flex align-items-center">
                  <Image
                    src="/uniswap-logo.png"
                    alt="Uniswap"
                    width={48}
                    height={48}
                  />
                </div>
                <h1 className="d-flex align-items-center m-0">
                  <span className="font-lightest">Uniswap</span>
                </h1>
              </Col>
            </Row>

            <Row className="pt-4">
              <Col>
                <iframe
                  src="https://app.uniswap.org/#/swap?theme=dark"
                  className={styles.uniswapFrame}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                  allow="clipboard-write"
                  style={{
                    display: "block",
                    border: "none",
                    width: "100%",
                    height: "720px",
                    borderRadius: "0.5rem",
                    background: "var(--bs-dark)",
                  }}
                />
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
    </Container>
  );
}
