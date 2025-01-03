import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import Breadcrumb from "../../../components/breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../../constants";

const Header = dynamic(() => import("../../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const ETHScanner = dynamic(
  () => import("../../../components/core/eth-scanner/ETHScanner"),
  {
    ssr: false,
  }
);

export default function ETHScannerPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Core - ETH Transactions" },
  ];

  return (
    <>
      <Head>
        <title>ETH Transactions | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="ETH Transactions | 6529 CORE" />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/core/eth-transactions`}
        />
        <meta property="og:title" content={`ETH Transactions`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <ETHScanner />
      </main>
    </>
  );
}
