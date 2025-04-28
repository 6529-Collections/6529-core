import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { Container, Row, Col } from "react-bootstrap";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";

const CommunityStatsComponent = dynamic(
  () => import("../../components/communityStats/CommunityStats"),
  { ssr: false }
);

export default function CommunityStats() {
  const { setTitle, title } = useContext(AuthContext);
  useEffect(() => {
    setTitle({
      title: "Stats | Network",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/network/stats`} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={`${styles.main} ${styles.tdhMain}`}>
        <Container fluid>
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
