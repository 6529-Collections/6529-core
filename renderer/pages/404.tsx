import Head from "next/head";
import styles from "../styles/Home.module.scss";
import Image from "next/image";
import { useContext, useEffect } from "react";
import { AuthContext } from "../components/auth/Auth";
import { SEIZE_URL } from "../../constants";

export default function Seize404() {
  const { setTitle, title } = useContext(AuthContext);
  useEffect(() => {
    setTitle({
      title: "NOT FOUND | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="404 NOT FOUND | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/404`} />
        <meta property="og:title" content="404 NOT FOUND" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <div className={styles.pageNotFound}>
          <Image
            width="0"
            height="0"
            style={{ height: "auto", width: "100px" }}
            src="/SummerGlasses.svg"
            alt="SummerGlasses"
          />
          <h2>404 | PAGE NOT FOUND</h2>
          <a href="/" className="pt-3">
            TAKE ME HOME
          </a>
        </div>
      </main>
    </>
  );
}
