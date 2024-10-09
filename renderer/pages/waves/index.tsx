import Head from "next/head";
import Breadcrumb, { Crumb } from "../../components/breadcrumb/Breadcrumb";
import Waves from "../../components/waves/Waves";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import { AuthContext } from "../../components/auth/Auth";
import { useContext, useEffect } from "react";
import { SEIZE_URL } from "../../../constants";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

export default function WavesPage() {
  const { setTitle, title } = useContext(AuthContext);
  const breadcrumbs: Crumb[] = [
    { display: "Home", href: "/" },
    { display: "Waves" },
  ];

  useEffect(() => {
    setTitle({
      title: "Waves | 6529 SEIZE",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Waves | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/waves`} />
        <meta property="og:title" content="Waves" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
        <meta property="og:description" content="6529 CORE" />
      </Head>
      <div className="tailwind-scope lg:tw-min-h-screen tw-bg-iron-950 tw-overflow-x-hidden">
        <div>
          <Header />
          <Breadcrumb breadcrumbs={breadcrumbs} />
        </div>
        <div className="tw-overflow-hidden tw-h-full tw-w-full">
          <Waves />
        </div>
      </div>
    </>
  );
}
