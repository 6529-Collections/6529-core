import { Container, Row, Col } from "react-bootstrap";
import styles from "./Apps.module.scss";
import Image from "next/image";
import Link from "next/link";

interface AppCard {
  name: string;
  description: string;
  icon: string;
  path: string;
}

interface AppSection {
  title: string;
  apps: AppCard[];
}

const APPS_SECTIONS: AppSection[] = [
  {
    title: "DApps",
    apps: [
      {
        name: "Uniswap",
        description:
          "Swap tokens and provide liquidity with the leading DEX protocol",
        icon: "/uniswap-logo.png",
        path: "/apps/uniswap",
      },
    ],
  },
];

export default function AppsGrid() {
  return (
    <Container fluid className={styles.mainContainer}>
      <Row>
        <Col>
          <Container className="pt-4">
            <Row>
              <Col>
                <h1>
                  <span className="font-lightest">Apps</span>
                </h1>
                <p className="text-muted">
                  Integrated applications within the 6529 CORE ecosystem
                </p>
              </Col>
            </Row>
            {APPS_SECTIONS.map((section) => (
              <div key={section.title}>
                <Row className="pt-5">
                  <Col>
                    <h2 className="font-lightest">{section.title}</h2>
                  </Col>
                </Row>
                <Row className="pt-3">
                  {section.apps.map((app) => (
                    <Col key={app.name} xs={6} sm={4} md={3} className="mb-4">
                      <Link href={app.path} className={styles.appCard}>
                        <div className={styles.appCardInner}>
                          <div className={styles.glowEffect} />
                          <div className={styles.appIconWrapper}>
                            <div className={styles.iconBackground} />
                            <Image
                              src={app.icon}
                              alt={app.name}
                              width={64}
                              height={64}
                              className={styles.appIcon}
                            />
                          </div>
                          <div className={styles.appInfo}>
                            <h3 className={styles.appName}>{app.name}</h3>
                          </div>
                        </div>
                      </Link>
                    </Col>
                  ))}
                </Row>
              </div>
            ))}
          </Container>
        </Col>
      </Row>
    </Container>
  );
}
