import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { VIEW } from "../../components/communityDownloads/CommunityDownloadsTDH";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";


const CommunityDownloadsTDH = dynamic(
  () => import("../../components/communityDownloads/CommunityDownloadsTDH"),
  {
    ssr: false,
  }
);

export default function ConsolidatedCommunityMetricsDownloads() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Consolidated Network Metrics Downloads | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta
          name="description"
          content="Consolidated Network Metrics Downloads | 6529 CORE"
        />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/open-data/consolidated-network-metrics`}
        />
        <meta
          property="og:title"
          content={`Consolidated Network Metrics Downloads`}
        />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <CommunityDownloadsTDH view={VIEW.CONSOLIDATION} />
      </main>
    </>
  );
}
