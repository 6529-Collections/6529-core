import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";

const CommunityDownloadsRoyalties = dynamic(
  () =>
    import("../../components/communityDownloads/CommunityDownloadsRoyalties"),
  {
    ssr: false,
  }
);

export default function RoyaltiesDownloads() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Royalties Downloads | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Royalties Downloads | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/open-data/royalties`} />
        <meta property="og:title" content={`Royalties Downloads`} />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <CommunityDownloadsRoyalties />
      </main>
    </>
  );
}
