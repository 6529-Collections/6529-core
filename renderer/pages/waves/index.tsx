import Head from "next/head";
import Waves from "../../components/waves/Waves";
import { AuthContext } from "../../components/auth/Auth";
import { useContext, useEffect } from "react";
import { SEIZE_URL } from "../../../constants";
export default function WavesPage() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Waves | 6529 CORE",
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
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
        <meta property="og:description" content="6529 CORE" />
      </Head>
      <div className="tailwind-scope lg:tw-min-h-screen tw-bg-iron-950 tw-overflow-x-hidden">
        <div className="tw-overflow-hidden tw-h-full tw-w-full">
          <Waves />
        </div>
      </div>
    </>
  );
}
