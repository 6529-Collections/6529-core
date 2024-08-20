import Head from "next/head";
import styles from "../styles/Home.module.scss";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../constants";

const Gas = dynamic(() => import("../components/gas-royalties/Gas"), {
  ssr: false,
});

const Header = dynamic(() => import("../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

export default function GasPage() {
  return (
    <>
      <Head>
        <title>Meme Gas | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Meme Gas | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/meme-gas`} />
        <meta property="og:title" content="Meme Gas" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Gas />
      </main>
    </>
  );
}
