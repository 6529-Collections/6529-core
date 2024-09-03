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

const SeedWallet = dynamic(
  () => import("../../../components/network/seedWallet/SeedWallet"),
  {
    ssr: false,
  }
);

export default function SeedWalletPage(props: any) {
  const pageProps = props.pageProps;
  const name: string = pageProps.name;
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Network - Seed Wallets", href: "/network/seed-wallets" },
    { display: `${name}` },
  ];

  return (
    <>
      <Head>
        <title>Seed Wallet {name} | 6529 CORE</title>
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
        <SeedWallet wallet_name={name} />
      </main>
    </>
  );
}

export async function getServerSideProps(req: any, res: any, resolvedUrl: any) {
  const name = req.query.name;
  return {
    props: {
      name,
    },
  };
}
