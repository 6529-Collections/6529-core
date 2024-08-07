import styles from "./AppWallet.module.scss";
import { useRouter } from "next/router";
import { LoginImage } from "../../pages/access";
import { Col, Container, Row } from "react-bootstrap";
import AppWalletConnect from "./AppWalletConnect";
import Image from "next/image";
import AppWalletProvider from "./AppWalletProvider";
import { useState } from "react";

export default function AppWallet({ image }: { readonly image: string }) {
  const router = useRouter();

  const [completed, setCompleted] = useState(false);

  const { task } = router.query;

  return (
    <Container fluid>
      <Row
        style={{
          height: "100vh",
        }}>
        <Col
          className="d-flex align-items-center justify-content-center"
          style={{
            backgroundColor: "#000",
          }}>
          <LoginImage image={image} alt="connect" />
        </Col>
        <Col className="d-flex flex-column align-items-center justify-content-between">
          <>
            <Image
              loading="eager"
              priority
              src="/6529.png"
              alt="6529Seize"
              width={60}
              height={60}
              style={{
                marginTop: "25px",
              }}
            />
            {completed ? (
              <div className="d-flex flex-column align-items-center justify-content-center">
                <h2 className="text-white">You're all set!</h2>
                <p className="text-white">You can now close this window.</p>
              </div>
            ) : (
              <>
                {task === "connect" && (
                  <AppWalletConnect setCompleted={setCompleted} />
                )}
                {task === "provider" && (
                  <AppWalletProvider setCompleted={setCompleted} />
                )}
              </>
            )}
            <span></span>
          </>
        </Col>
      </Row>
    </Container>
  );
}
