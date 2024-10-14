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

const AppLogs = dynamic(() => import("../../components/core/appLogs/AppLogs"), {
  ssr: false,
});

export default function AppInfoPage() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Core - App Logs" },
  ];

  return (
    <>
      <Head>
        <title>App Logs | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="App Logs | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/core/app-logs`} />
        <meta property="og:title" content={`App Logs`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <AppLogs />
      </main>
    </>
  );
}
