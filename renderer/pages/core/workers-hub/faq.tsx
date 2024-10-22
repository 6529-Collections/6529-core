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

export default function WorkersHubFaqPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Core - Workers Hub", href: "/core/workers-hub" },
    { display: "FAQ" },
  ];

  useEffect(() => {
    const handleWhatIsRpcUrlClick = () => {
      const targetAccordionButton = document.querySelector(
        "#accordion-rpc-url .accordion-button"
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

    const anchor = document.querySelector('a[href="#what-is-an-rpc-url"]');
    if (anchor) {
      anchor.addEventListener("click", handleWhatIsRpcUrlClick);
    }

    if (window.location.hash === "#what-is-an-rpc-url") {
      handleWhatIsRpcUrlClick();
    }

    return () => {
      if (anchor) {
        anchor.removeEventListener("click", handleWhatIsRpcUrlClick);
      }
    };
  }, []);

  return (
    <>
      <Head>
        <title>Workers Hub FAQ | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Workers Hub FAQ | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/core/workers-hub/faq`} />
        <meta property="og:title" content={`Workers Hub FAQ`} />
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
                href="/core/workers-hub">
                <FontAwesomeIcon icon={faCircleArrowLeft} height={16} />
                Back to Workers Hub
              </Link>
            </Col>
          </Row>
          <Row className="pt-2">
            <Col className="d-flex align-items-center justify-content-between">
              <h1 className="float-none">
                <span className="font-lightest">Workers Hub</span> FAQ
              </h1>
            </Col>
          </Row>
          <Row className="pt-4">
            <Col>
              <WhatIsWorkersHubAccordion />
              <WhatIsRpcUrlAccordion />
            </Col>
          </Row>
        </Container>
      </main>
    </>
  );
}

function WhatIsWorkersHubAccordion() {
  return (
    <Accordion className="mt-2 pb-2">
      <Accordion.Item defaultChecked={true} eventKey={"0"}>
        <Accordion.Button id="what-is-workers-hub">
          <b>What is Workers Hub?</b>
        </Accordion.Button>
        <Accordion.Body>
          <Container>
            <ul>
              <li className="mb-2">
                Workers Hub hosts the logic of pulling data from the blockchain.
              </li>
              <li className="mb-2">
                Workers execute tasks and report their status to{" "}
                <a
                  href="/core/workers-hub"
                  style={{
                    color: "inherit",
                  }}>
                  Workers Hub
                </a>
              </li>
              <li className="mb-2">
                Workers are assigned dedicated &apos;Task&apos; and the
                &apos;Logs Directory&apos; which you can monitor in the Workers
                Hub.
              </li>
              <li className="mb-2">
                Workers need access to an RPC Provider, which supplies an{" "}
                <a href="#what-is-an-rpc-url" style={{ color: "inherit" }}>
                  RPC URL
                </a>
                , to retrieve data from the blockchain.
              </li>
              <li className="mb-2">
                You can have multiple RPC Providers but only one can be active
                at a time.
              </li>
            </ul>
          </Container>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}

function WhatIsRpcUrlAccordion() {
  return (
    <Accordion className="mt-2 pb-2" id="accordion-rpc-url">
      <Accordion.Item defaultChecked={true} eventKey={"0"}>
        <Accordion.Button>
          <b>What is an RPC URL?</b>
        </Accordion.Button>
        <Accordion.Body>
          <Container id="what-is-an-rpc-url">
            <p>
              An RPC URL (Remote Procedure Call URL) is the endpoint that allows
              a client (such as a decentralized application or wallet) to
              interact with a blockchain network. It acts as a bridge between
              the application and the blockchain node, enabling the app to send
              requests (such as reading data or broadcasting transactions) to
              the network and receive responses.
            </p>
            <p>
              When you use an RPC URL, you&apos;re connecting to a specific node
              that performs operations like querying blockchain data (e.g.,
              checking account balances, retrieving transaction details) or
              submitting signed transactions to the network.
            </p>
            <p>Use Cases of RPC URL: </p>
            <ol>
              <li className="mb-2">
                Querying blockchain data: Retrieve information like block
                height, transaction details, or token balances.
              </li>
              <li className="mb-2">
                Broadcasting transactions: Send signed transactions to the
                blockchain for inclusion in blocks.
              </li>
              <li className="mb-2">
                Interacting with smart contracts: Call functions of smart
                contracts deployed on the blockchain.
              </li>
            </ol>
            <p>RPC URL Providers:</p>
            <p>
              Visit{" "}
              <a
                href="https://ethereumnodes.com/"
                target="_blank"
                rel="noreferrer"
                style={{
                  color: "inherit",
                }}>
                https://ethereumnodes.com/
              </a>{" "}
              for a list of RPC URL providers.
            </p>
          </Container>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
}
