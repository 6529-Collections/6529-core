import Head from "next/head";
import styles from "../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { Container, Row, Col } from "react-bootstrap";
import Breadcrumb, { Crumb } from "../components/breadcrumb/Breadcrumb";
import { useState } from "react";
import HeaderPlaceholder from "../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../constants";

const Header = dynamic(() => import("../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const CommunityStatsComponent = dynamic(
  () => import("../components/communityStats/CommunityStats"),
  { ssr: false }
);

export default function CommunityStats() {
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([
    { display: "Home", href: "/" },
    { display: "Community Stats" },
  ]);

  return (
    <>
      <Head>
        <title>Community Stats | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Community Stats | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/community-stats`} />
        <meta property="og:title" content="Community Stats" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={`${styles.main} ${styles.tdhMain}`}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <Container fluid className={styles.mainContainer}>
          <Row>
            <Col>
              <Container className="no-padding">
                <Row>
                  <Col>
                    <CommunityStatsComponent />
                  </Col>
                </Row>
              </Container>
            </Col>
          </Row>
        </Container>
      </main>
    </>
  );
}
