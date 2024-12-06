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

const SeedWalletImport = dynamic(
  () => import("../../../components/core/core-wallet/SeedWalletImport"),
  {
    ssr: false,
  }
);

export default function SeedWalletPage(props: any) {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Core - Core Wallets", href: "/core/core-wallets" },
    { display: "Import" },
  ];

  return (
    <>
      <Head>
        <title>Core Wallet Import | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Core Wallets | 6529 CORE" />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/core/core-wallets/import-wallet`}
        />
        <meta property="og:title" content={`Core Wallets Import`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <SeedWalletImport />
      </main>
    </>
  );
}
