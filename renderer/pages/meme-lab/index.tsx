import Head from "next/head";
import styles from "../../styles/Home.module.scss";

import { useContext, useEffect, useState } from "react";
import Breadcrumb, { Crumb } from "../../components/breadcrumb/Breadcrumb";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

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

  const [connectedWallets, setConnectedWallets] = useState<string[]>([]);

  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([
    { display: "Home", href: "/" },
    { display: "Meme Lab" },
  ]);

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
        <Header onSetWallets={(wallets) => setConnectedWallets(wallets)} />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <MemeLabComponent wallets={connectedWallets} />
      </main>
    </>
  );
}
