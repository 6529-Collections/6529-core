import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import { Container, Row, Col } from "react-bootstrap";
import dynamic from "next/dynamic";
import { useContext } from "react";
import { AuthContext } from "../../../components/auth/Auth";
import { SEIZE_URL } from "../../../../constants";

const NextGenAdminComponent = dynamic(
  () => import("../../../components/nextGen/admin/NextGenAdmin"),
  {
    ssr: false,
  }
);

export default function NextGenAdmin() {
  const { setTitle, title } = useContext(AuthContext);
  setTitle({
    title: "NextGen Admin | 6529 CORE",
  });

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="NextGen Admin | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/nextgen/admin`} />
        <meta property="og:title" content="NextGen Admin" />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <Container fluid className={`${styles.main}`}>
          <Row>
            <Col>
              <NextGenAdminComponent />
            </Col>
          </Row>
        </Container>
      </main>
    </>
  );
}
