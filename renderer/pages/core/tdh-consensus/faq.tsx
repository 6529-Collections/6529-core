import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import Breadcrumb from "../../../components/breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../../constants";
import { Container, Row, Col, Accordion } from "react-bootstrap";
import { useEffect } from "react";
import Link from "next/link";
import { faCircleArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const Header = dynamic(() => import("../../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const accordionStyle = {
  backgroundColor: "rgb(34, 34, 34)",
  color: "white",
  border: "10px solid rgb(30, 30, 30)",
};

export default function WorkersHubFaqPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Core - TDH Consensus", href: "/core/tdh-consensus" },
    { display: "FAQ" },
  ];

  useEffect(() => {
    const handleWhatIsTDHConsensusClick = () => {
      const targetAccordionButton = document.querySelector(
        "#accordion-tdh-consensus .accordion-button"
      );
      if (
        targetAccordionButton &&
        targetAccordionButton instanceof HTMLElement
      ) {
        if (targetAccordionButton.classList.contains("collapsed")) {
          targetAccordionButton.click();
        }
      }
    };

    const anchor = document.querySelector('a[href="#what-is-tdh-consensus"]');
    if (anchor) {
      anchor.addEventListener("click", handleWhatIsTDHConsensusClick);
    }

    if (window.location.hash === "#what-is-tdh-consensus") {
      handleWhatIsTDHConsensusClick();
    }

    return () => {
      if (anchor) {
        anchor.removeEventListener("click", handleWhatIsTDHConsensusClick);
      }
    };
  }, []);

  return (
    <>
      <Head>
        <title>TDH Consensus FAQ | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="TDH Consensus FAQ | 6529 CORE" />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/core/tdh-consensus/faq`}
        />
        <meta property="og:title" content={`TDH Consensus FAQ`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <Container className="pt-5 pb-5">
          <Row>
            <Col>
              <Link
                className="font-smaller d-flex align-items-center gap-2 decoration-none"
                href="/core/tdh-consensus">
                <FontAwesomeIcon icon={faCircleArrowLeft} height={16} />
                Back to TDH Consensus
              </Link>
            </Col>
          </Row>
          <Row className="pt-2">
            <Col className="d-flex align-items-center justify-content-between">
              <h1 className="float-none">
                <span className="font-lightest">TDH Consensus</span> FAQ
              </h1>
            </Col>
          </Row>
          <Row className="pt-4">
            <Col>
              <WhatIsTDHConsensusAccordion />
              <WhatIsSomethingElseAccordion />
            </Col>
          </Row>
        </Container>
      </main>
    </>
  );
}

function WhatIsTDHConsensusAccordion() {
  return (
    <Accordion className="mt-2 pb-2">
      <Accordion.Item defaultChecked={true} eventKey={"0"}>
        <Accordion.Button id="what-is-tdh-consensus">
          <b>What is TDH Consensus?</b>
        </Accordion.Button>
        <Accordion.Body style={accordionStyle}>
          <Container>
            <ul>
              <li className="mb-2">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
              </li>
            </ul>
          </Container>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}

function WhatIsSomethingElseAccordion() {
  return (
    <Accordion className="mt-2 pb-2" id="accordion-something-else">
      <Accordion.Item defaultChecked={true} eventKey={"0"}>
        <Accordion.Button>
          <b>What is something else?</b>
        </Accordion.Button>
        <Accordion.Body style={accordionStyle}>
          <Container id="what-is-something-else">
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
          </Container>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}
