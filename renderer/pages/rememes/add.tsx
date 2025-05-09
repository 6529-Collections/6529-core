import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";

const AddRememeComponent = dynamic(
  () => import("../../components/rememes/RememeAddPage"),
  { ssr: false }
);

export default function ReMemes() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Add ReMemes | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Add ReMemes | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/rememes/add`} />
        <meta property="og:title" content="ReMemes" />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/re-memes-b.jpeg`} />
      </Head>

      <main className={styles.main}>
        <AddRememeComponent />
      </main>
    </>
  );
}
