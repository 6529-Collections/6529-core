import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import Breadcrumb from "../../components/breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { Container, Row, Col } from "react-bootstrap";
import { SEIZE_URL } from "../../../constants";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowRightArrowLeft,
  faSignature,
} from "@fortawesome/free-solid-svg-icons";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

interface AppCard {
  title: string;
  description: string;
  icon: any;
  link: string;
  status: "live" | "coming-soon";
}

const AVAILABLE_APPS: AppCard[] = [
  {
    title: "Swap",
    description: "Swap tokens and provide liquidity on Ethereum",
    icon: faArrowRightArrowLeft,
    link: "/apps/swap",
    status: "live",
  },
];

export default function AppsPage() {
  const breadcrumbs = [{ display: "Home", href: "/" }, { display: "Apps" }];

  return (
    <>
      <Head>
        <title>Apps | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Decentralized Apps | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/apps`} />
        <meta property="og:title" content="Decentralized Apps" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <Container fluid className={styles.mainContainer}>
          <Row className="justify-content-center tw-mt-8">
            <Col xs={12} className="text-center mb-5 ">
              <h1 className={styles.title}>
                <span className="font-lightest">Decentralized</span> Apps
              </h1>
              <p className={styles.subtitle}>
                Explore and interact with decentralized applications directly
                from 6529 CORE
              </p>
            </Col>
          </Row>
          <Row className="justify-content-center">
            {AVAILABLE_APPS.map((app) => (
              <Col
                key={app.title}
                xs={12}
                sm={8}
                md={6}
                lg={4}
                className="mb-4"
              >
                <Link
                  href={app.status === "live" ? app.link : "#"}
                  className={`${styles.appCard} ${
                    app.status !== "live" ? styles.comingSoon : ""
                  }`}
                >
                  <div className={styles.appIcon}>
                    <FontAwesomeIcon icon={app.icon} />
                  </div>
                  <div className={styles.appInfo}>
                    <h3>
                      {app.title}
                      {app.status !== "live" && (
                        <span className={styles.comingSoonBadge}>
                          Coming Soon
                        </span>
                      )}
                    </h3>
                    <p>{app.description}</p>
                  </div>
                </Link>
              </Col>
            ))}
          </Row>
        </Container>
      </main>
    </>
  );
}
