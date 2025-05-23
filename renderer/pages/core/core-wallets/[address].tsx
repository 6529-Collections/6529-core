import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { SEIZE_URL } from "../../../../constants";

const SeedWallet = dynamic(
  () => import("../../../components/core/core-wallet/SeedWallet"),
  {
    ssr: false,
  }
);

export default function SeedWalletPage(props: any) {
  const pageProps = props.pageProps;
  const address: string = pageProps.address;

  return (
    <>
      <Head>
        <title>Core Wallet {address} | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta
          name="description"
          content={`Core Wallet ${address} | 6529 CORE`}
        />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/core/core-wallets/${address}`}
        />
        <meta property="og:title" content={`Core Wallets`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <SeedWallet address={address} />
      </main>
    </>
  );
}

export async function getServerSideProps(req: any, res: any, resolvedUrl: any) {
  const address = req.query.address;
  return {
    props: {
      address,
    },
  };
}
