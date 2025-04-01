import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import Breadcrumb from "../../components/breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../constants";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const ENSApp = dynamic(() => import("../../components/apps/ens/ENSApp"), {
  ssr: false,
});

export default function ENSPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Apps", href: "/apps" },
    { display: "ENS" },
  ];

  return (
    <>
      <Head>
        <title>ENS | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Ethereum Name Service | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/apps/ens`} />
        <meta property="og:title" content="Ethereum Name Service" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <ENSApp />
      </main>
    </>
  );
}
