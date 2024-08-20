import Head from "next/head";
import { SEIZE_URL } from "../../../constants";
import { getCommonHeaders } from "../../helpers/server.helpers";
import { commonApiFetch } from "../../services/api/common-api";
import dynamic from "next/dynamic";

const AppWalletComponent = dynamic(
  () => import("../../components/app-wallet/AppWallet"),
  {
    ssr: false,
  }
);

export default function SeizeAppWallet(props: any) {
  const pageProps = props.pageProps;

  return (
    <>
      <Head>
        <title>App Wallet | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="App Wallet| 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/app-wallet`} />
        <meta property="og:title" content="App Wallet" />
        <meta property="og:description" content="6529 CORE" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
      </Head>

      <main
        style={{
          minHeight: "100vh",
        }}>
        <AppWalletComponent image={pageProps.image} />
      </main>
    </>
  );
}

export async function getServerSideProps(
  req: any,
  res: any,
  resolvedUrl: any
): Promise<{
  props: {
    image: string;
  };
}> {
  try {
    const headers = getCommonHeaders(req);
    const image = await commonApiFetch<{
      image: string;
    }>({
      endpoint: ``,
      headers: headers,
    }).then(async (response) => response.image);

    return {
      props: {
        image,
      },
    };
  } catch (e: any) {
    return {
      props: {
        image: "",
      },
    };
  }
}
