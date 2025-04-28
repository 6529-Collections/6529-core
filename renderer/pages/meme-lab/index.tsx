import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import { useContext, useEffect } from "react";
import dynamic from "next/dynamic";
import { AuthContext, useAuth } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";

const MemeLabComponent = dynamic(
  () => import("../../components/memelab/MemeLab"),
  { ssr: false }
);

export default function MemeLab() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Meme Lab | 6529 CORE",
    });
  }, []);

  const { connectedProfile } = useAuth();

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Meme Lab | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/meme-lab`} />
        <meta property="og:title" content="Meme Lab" />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/meme-lab.jpg`} />
      </Head>

      <main className={styles.main}>
        <MemeLabComponent
          wallets={connectedProfile?.wallets?.map((w) => w.wallet) ?? []}
        />
      </main>
    </>
  );
}
