import Head from "next/head";
import styles from "../styles/Home.module.scss";
import Image from "next/image";
import { useContext, useEffect, useState } from "react";
import Breadcrumb, { Crumb } from "../components/breadcrumb/Breadcrumb";
import { Container, Row, Col } from "react-bootstrap";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../components/header/HeaderPlaceholder";
import { AuthContext } from "../components/auth/Auth";
import { SEIZE_URL } from "../../constants";

const Header = dynamic(() => import("../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

export default function Buidl() {
  const { setTitle, title } = useContext(AuthContext);
  useEffect(() => {
    setTitle({
      title: "BUIDL | 6529 CORE",
    });
  }, []);

  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([
    { display: "Home", href: "/" },
    { display: "BUIDL" },
  ]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="BUIDL | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/buidl`} />
        <meta property="og:title" content="BUIDL" />
        <meta property="og:description" content="6529.io" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <Container fluid className={`${styles.pageNotFound} text-center`}>
          <Row>
            <Col>
              <Image
                src="/SummerGlasses.svg"
                width={100}
                height={100}
                alt="SummerGlasses"
              />
            </Col>
          </Row>
          <Row>
            <Col>
              <h4>
                <p>
                  We are going to BUIDL together to spread the word about a
                  decentralized metaverse.
                </p>
                <p>Tools to help in this goal are coming soon.</p>
              </h4>
            </Col>
          </Row>
        </Container>
      </main>
    </>
  );
}
