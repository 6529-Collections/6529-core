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
  () => import("../../../components/core/seed-wallet/SeedWalletImport"),
  {
    ssr: false,
  }
);

export default function SeedWalletPage(props: any) {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Core - Seed Wallets", href: "/core/seed-wallets" },
    { display: "Import" },
  ];

  return (
    <>
      <Head>
        <title>Seed Wallet Import | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Seed Wallets | 6529 CORE" />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/core/seed-wallets/import-wallet`}
        />
        <meta property="og:title" content={`Seed Wallets Import`} />
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
