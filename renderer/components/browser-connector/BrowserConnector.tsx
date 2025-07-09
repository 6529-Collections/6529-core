"use client";

import { useSearchParams } from "next/navigation";
import { LoginImage } from "../../pages/access";
import { Col, Container, Row } from "react-bootstrap";
import BrowserConnectorConnect from "./BrowserConnectorConnect";
import Image from "next/image";
import BrowserConnectorProvider from "./BrowserConnectorProvider";
import { useEffect, useState } from "react";

export default function BrowserConnector({
  image,
}: {
  readonly image: string;
}) {
  const searchParams = useSearchParams();

  const [isCompleted, setIsCompleted] = useState(false);
  const [isExpired, setExpired] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const task = searchParams?.get("task");
  const scheme = searchParams?.get("scheme");
  const t = searchParams?.get("t");

  useEffect(() => {
    if (!t) {
      setExpired(true);
      setTimeLeft(null);
      return;
    }

    const expiryTime = parseInt(t) + 60 * 1000;

    const calculateTimeLeft = () => {
      const now = Date.now();
      const timeRemaining = expiryTime - now;

      if (timeRemaining > 0) {
        setTimeLeft(timeRemaining);
      } else {
        setExpired(true);
        setTimeLeft(0);
      }
    };

    calculateTimeLeft();

    const intervalId = setInterval(() => {
      calculateTimeLeft();
    }, 1000);

    return () => clearInterval(intervalId);
  }, [t]);

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
            {isCompleted ? (
              <div className="d-flex flex-column align-items-center justify-content-center">
                <h2 className="text-white">You're all set!</h2>
                <p className="text-white">You can now close this window.</p>
              </div>
            ) : isExpired ? (
              <div className="d-flex flex-column align-items-center justify-content-center">
                <h2 className="text-white">This page is expired</h2>
                <p className="text-white">You can now close this window.</p>
              </div>
            ) : (
              <>
                {task === "connect" && (
                  <BrowserConnectorConnect
                    scheme={scheme}
                    setCompleted={setIsCompleted}
                  />
                )}
                {task === "provider" && (
                  <BrowserConnectorProvider
                    scheme={scheme}
                    setCompleted={setIsCompleted}
                  />
                )}
              </>
            )}
            <span className="font-color-h pb-2">
              {!isCompleted && timeLeft ? (
                <>
                  This page will expire in {(timeLeft / 1000).toFixed(0)}{" "}
                  seconds
                </>
              ) : (
                <></>
              )}
            </span>
          </>
        </Col>
      </Row>
    </Container>
  );
}
