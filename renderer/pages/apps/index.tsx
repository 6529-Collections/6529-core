import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import Breadcrumb from "../../components/breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../constants";
import AppsGrid from "../../components/apps/AppsGrid";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

export default function AppsPage() {
  const breadcrumbs = [{ display: "Home", href: "/" }, { display: "Apps" }];

  return (
    <>
      <Head>
        <title>Apps | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Apps | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/apps`} />
        <meta property="og:title" content="Apps" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <AppsGrid />
      </main>
    </>
  );
}
