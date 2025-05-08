import Groups from "../../components/groups/page/Groups";
import Head from "next/head";
import { useContext, useEffect } from "react";
import { AuthContext } from "../../components/auth/Auth";
import { SEIZE_URL } from "../../../constants";

export default function GroupsPage() {
  const { setTitle, title } = useContext(AuthContext);

  useEffect(() => {
    setTitle({
      title: "Groups | Network",
    });
  }, []);

  return (
    <>
      <Head>
        <title>{title}</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/network/groups`} />
        <meta property="og:title" content="Network Groups" />
        <meta property="og:description" content="6529 CORE" />
        <meta property="og:image" content={`${SEIZE_URL}/6529io.png`} />
      </Head>

      <main className="tw-min-h-[100dvh] tw-bg-iron-950">
        <div className="tailwind-scope tw-min-h-screen tw-pt-2 lg:tw-pt-8 tw-pb-16 lg:tw-pb-20 tw-px-6 min-[992px]:tw-px-3 min-[992px]:tw-max-w-[960px] max-[1100px]:tw-max-w-[950px] min-[1200px]:tw-max-w-[1050px] min-[1300px]:tw-max-w-[1150px] min-[1400px]:tw-max-w-[1250px] min-[1500px]:tw-max-w-[1280px] tw-mx-auto">
          <Groups />
        </div>
      </main>
    </>
  );
}
