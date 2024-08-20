import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import Breadcrumb from "../../components/breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { SEIZE_URL } from "../../../constants";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const CommunityDownloadsRememes = dynamic(
  () => import("../../components/communityDownloads/CommunityDownloadsRememes"),
  {
    ssr: false,
  }
);

export default function RememesDownloads() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Open Data", href: "/open-data" },
    { display: "Rememes" },
  ];

  return (
    <>
      <Head>
        <title>Rememes Downloads | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Rememes Downloads | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/open-data/rememes`} />
        <meta property="og:title" content={`Rememes Downloads`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <CommunityDownloadsRememes />
      </main>
    </>
  );
}
