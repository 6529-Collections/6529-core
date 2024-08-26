import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import { useState } from "react";
import Breadcrumb, { Crumb } from "../../components/breadcrumb/Breadcrumb";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../constants";

interface Props {
  meme_id?: number;
}

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const RememesComponent = dynamic(
  () => import("../../components/rememes/Rememes"),
  { ssr: false }
);

export default function ReMemes(props: Readonly<Props>) {
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([
    { display: "Home", href: "/" },
    { display: "ReMemes" },
  ]);

  return (
    <>
      <Head>
        <title>ReMemes | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="ReMemes | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/rememes`} />
        <meta property="og:title" content="ReMemes" />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/re-memes-b.jpeg`} />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <RememesComponent />
      </main>
    </>
  );
}
