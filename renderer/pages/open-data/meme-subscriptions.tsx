import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import Breadcrumb from "../../components/breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
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
  const { setTitle, title } = useContext(AuthContext);
  const breadcrumbs = [
    { display: "Home", href: "/" },
    { display: "Open Data", href: "/open-data" },
    { display: "Meme Subscriptions" },
  ];

  useEffect(() => {
    setTitle({
      title: "Meme Subscriptions Downloads | 6529 CORE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
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
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <CommunityDownloadsSubscriptions />
      </main>
    </>
  );
}
