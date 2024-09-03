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

const SeedWallets = dynamic(
  () => import("../../../components/network/seedWallet/SeedWallets"),
  {
    ssr: false,
  }
);

export default function SeedWalletPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Network - Seed Wallets" },
  ];

  return (
    <>
      <Head>
        <title>Seed Wallets | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Seed Wallets | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/network/seed-wallets`} />
        <meta property="og:title" content={`Seed Wallets`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <SeedWallets />
      </main>
    </>
  );
}
