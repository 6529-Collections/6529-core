import Head from "next/head";
import styles from "../../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { SEIZE_URL } from "../../../../constants";

const TDHCalculation = dynamic(
  () => import("../../../components/core/tdh-calculation/TDHCalculation"),
  {
    ssr: false,
  }
);

export default function TDHConsensusPage() {
  return (
    <>
      <Head>
        <title>TDH Consensus | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="TDH Calculation | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/core/tdh-calculation`} />
        <meta property="og:title" content={`TDH Calculation`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <TDHCalculation />
      </main>
    </>
  );
}
