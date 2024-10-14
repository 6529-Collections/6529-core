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

const AppInfo = dynamic(() => import("../../components/core/appInfo/AppInfo"), {
  ssr: false,
});

export default function AppInfoPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Core - App Info" },
  ];

  return (
    <>
      <Head>
        <title>App Info | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="App Info | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/core/app-info`} />
        <meta property="og:title" content={`App Info`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <AppInfo />
      </main>
    </>
  );
}
