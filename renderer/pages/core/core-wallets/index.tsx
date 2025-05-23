import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { SEIZE_URL } from "../../../../constants";

const CoreWallets = dynamic(
  () => import("../../../components/core/core-wallet/SeedWallets"),
  {
    ssr: false,
  }
);

export default function SeedWalletPage() {
  return (
    <>
      <Head>
        <title>Core Wallets | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Core Wallets | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/core/core-wallets`} />
        <meta property="og:title" content={`Core Wallets`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <CoreWallets />
      </main>
    </>
  );
}
