import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../../components/auth/Auth";
import { SEIZE_URL } from "../../../../constants";


const AppWalletsComponent = dynamic(
  () => import("../../../components/app-wallets/AppWallets"),
  {
    ssr: false,
  }
);

export default function AppWallets() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "App Wallets | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="App Wallets | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/tools/app-wallets`} />
        <meta property="og:title" content="App Wallets" />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <AppWalletsComponent />
      </main>
    </>
  );
}
