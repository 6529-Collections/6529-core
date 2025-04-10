import styles from "../../../styles/Home.module.scss";
import Head from "next/head";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../../components/header/HeaderPlaceholder";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../../components/auth/Auth";
import Breadcrumb, { Crumb } from "../../../components/breadcrumb/Breadcrumb";
import { formatAddress } from "../../../helpers/Helpers";
import { SEIZE_URL } from "../../../../constants";

const Header = dynamic(() => import("../../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const AppWalletComponent = dynamic(
  () => import("../../../components/app-wallets/AppWallet"),
  {
    ssr: false,
  }
);

export default function AppWalletPage(props: any) {
  const { setTitle, title } = useContext(AuthContext);

  const pageProps = props.pageProps;
  const address = pageProps.address;

  const breadcrumbs: Crumb[] = [
    { display: "Home", href: "/" },
    { display: "App Wallets", href: "/tools/app-wallets" },
    { display: address },
  ];

  useEffect(() => {
    setTitle({
      title: `${formatAddress(address)} | App Wallets | 6529 CORE`,
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content={title} />
        <meta
          property="og:url"
          content={`${SEIZE_URL}/the-memes/${pageProps.id}`}
        />
        <meta property="og:title" content={pageProps.name} />
        <meta property="og:image" content={pageProps.image} />
        <meta property="og:description" content="6529 CORE" />
      </Head>

      <main className={styles.main}>
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <AppWalletComponent address={address} />
      </main>
    </>
  );
}

export async function getServerSideProps(req: any, res: any, resolvedUrl: any) {
  const address = req.query["app-wallet-address"];

  return {
    props: {
      address,
    },
  };
}
