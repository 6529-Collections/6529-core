import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";

const CommunityDownloads = dynamic(
  () => import("../../components/communityDownloads/CommunityDownloads"),
  {
    ssr: false,
  }
);

export default function Downloads() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Open Data | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Open Data | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/open-data`} />
        <meta property="og:title" content={`Open Data`} />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <CommunityDownloads />
      </main>
    </>
  );
}
