import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../../components/auth/Auth";
import { SEIZE_URL } from "../../../../constants";

const AppWalletImport = dynamic(
  () => import("../../../components/app-wallets/AppWalletImport"),
  {
    ssr: false,
  }
);

export default function AppWalletImportPage(props: any) {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Import App Wallet | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="App Wallets | 6529 CORE" />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/tools/app-wallets/import-wallet`}
        />
        <meta property="og:title" content={`Import App Wallet`} />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <AppWalletImport />
      </main>
    </>
  );
}
