import Head from "next/head";
import styles from "../../styles/Home.module.scss";

import { useState } from "react";
import Breadcrumb, { Crumb } from "../../components/breadcrumb/Breadcrumb";
import { Container, Row, Col } from "react-bootstrap";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../constants";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const GradientsComponent = dynamic(
  () => import("../../components/6529Gradient/6529Gradient"),
  { ssr: false }
);

export default function GradientsPage() {
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([
    { display: "Home", href: "/" },
    { display: "6529 Gradient" },
  ]);
  const [connectedWallets, setConnectedWallets] = useState<string[]>([]);

  return (
    <>
      <Head>
        <title>6529 Gradient | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="6529 Gradient | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/6529-gradient`} />
        <meta property="og:title" content={`6529 Gradient`} />
        <meta property="og:description" content={`6529 CORE`} />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/gradients-preview.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header onSetWallets={(wallets) => setConnectedWallets(wallets)} />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <GradientsComponent wallets={connectedWallets} />
      </main>
    </>
  );
}
