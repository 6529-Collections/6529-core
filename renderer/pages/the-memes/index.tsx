import Head from "next/head";
import styles from "../../styles/Home.module.scss";

import { useState } from "react";
import Breadcrumb, { Crumb } from "../../components/breadcrumb/Breadcrumb";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../constants";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const TheMemesComponent = dynamic(
  () => import("../../components/the-memes/TheMemes"),
  { ssr: false }
);

export default function TheMemesPage() {
  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>([
    { display: "Home", href: "/" },
    { display: "The Memes" },
  ]);

  return (
    <>
      <Head>
        <title>The Memes | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="The Memes | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/the-memes`} />
        <meta property="og:title" content="The Memes" />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/memes-preview.png`} />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <TheMemesComponent
          setCrumbs={function (crumbs: Crumb[]) {
            setBreadcrumbs(crumbs);
          }}
        />
      </main>
    </>
  );
}
