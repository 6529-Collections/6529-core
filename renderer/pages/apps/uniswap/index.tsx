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

const UniswapApp = dynamic(
  () => import("../../../components/apps/uniswap/UniswapApp"),
  {
    ssr: false,
  }
);

export default function UniswapPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Apps", href: "/apps" },
    { display: "Uniswap" },
  ];

  return (
    <>
      <Head>
        <title>Uniswap | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Uniswap | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/apps/uniswap`} />
        <meta property="og:title" content="Uniswap" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <UniswapApp />
      </main>
    </>
  );
} 