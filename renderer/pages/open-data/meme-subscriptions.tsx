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

const CommunityDownloadsSubscriptions = dynamic(
  () =>
    import(
      "../../components/communityDownloads/CommunityDownloadsSubscriptions"
    ),
  {
    ssr: false,
  }
);

export default function MemeSubscriptions() {
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Open Data", href: "/open-data" },
    { display: "Meme Subscriptions" },
  ];

  return (
    <>
      <Head>
        <title>Meme Subscriptions Downloads | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta
          name="description"
          content="Meme Subscriptions Downloads | 6529 CORE"
        />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/open-data/meme-subscriptions`}
        />
        <meta property="og:title" content={`Meme Subscriptions Downloads`} />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <CommunityDownloadsSubscriptions />
      </main>
    </>
  );
}
