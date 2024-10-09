import Head from "next/head";
import styles from "../../styles/Home.module.scss";
import dynamic from "next/dynamic";
import { GRADIENT_CONTRACT } from "../../constants";
import { fetchUrl } from "../../services/6529api";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_API_URL, SEIZE_URL } from "../../../constants";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const GradientPageComponent = dynamic(
  () => import("../../components/6529Gradient/GradientPage"),
  {
    ssr: false,
  }
);

export default function GradientPageIndex(props: any) {
  const { setTitle, title } = useContext(AuthContext);


  const pageProps = props.pageProps;
  const pagenameFull = `${pageProps.name} | 6529 CORE`;

  useEffect(() => {
    setTitle({
      title: pagenameFull,
    });
  }, [pagenameFull]);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content={pagenameFull} />
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
        <GradientPageComponent />
      </main>
    </>
  );
}

export async function getServerSideProps(req: any, res: any, resolvedUrl: any) {
  const id = req.query.id;
  const response = await fetchUrl(
    `${SEIZE_API_URL}/api/nfts?contract=${GRADIENT_CONTRACT}&id=${id}`
  );
  let name = `Gradient #${id}`;
  let image = `${SEIZE_URL}/Seize_Logo_Glasses_2.png`;
  if (response && response.data && response.data.length > 0) {
    name = response.data[0].name;
    image = response.data[0].thumbnail
      ? response.data[0].thumbnail
      : response.data[0].image
      ? response.data[0].image
      : image;
  }
  return {
    props: {
      id: id,
      name: name,
      image: image,
    },
  };
}
