import Breadcrumb, { Crumb } from "../../components/breadcrumb/Breadcrumb";
import Head from "next/head";
import dynamic from "next/dynamic";
import HeaderPlaceholder from "../../components/header/HeaderPlaceholder";
import WaveDetailed from "../../components/waves/detailed/WaveDetailed";
import { useRouter } from "next/router";
import { useQuery } from "@tanstack/react-query";
import { QueryKey } from "../../components/react-query-wrapper/ReactQueryWrapper";
import { Wave } from "../../generated/models/Wave";
import { commonApiFetch } from "../../services/api/common-api";
import { SEIZE_URL } from "../../../constants";
import { useEffect, useState } from "react";

const Header = dynamic(() => import("../../components/header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

export default function WavePage() {
  const router = useRouter();
  const wave_id = (router.query.wave as string)?.toLowerCase();

  const { data: wave, isError } = useQuery<Wave>({
    queryKey: [QueryKey.WAVE, { wave_id }],
    queryFn: async () =>
      await commonApiFetch<Wave>({
        endpoint: `waves/${wave_id}`,
      }),
    enabled: !!wave_id,
  });

  const getBreadCrumbs = (): Crumb[] => {
    return [
      { display: "Home", href: "/" },
      { display: "My Stream", href: "/my-stream" },
      { display: wave?.name ?? "" },
    ];
  };

  const [breadcrumbs, setBreadcrumbs] = useState<Crumb[]>(getBreadCrumbs());
  useEffect(() => setBreadcrumbs(getBreadCrumbs()), [wave]);

  return (
    <>
      <Head>
        <title>Waves | 6529 CORE</title>
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
      <main className="tailwind-scope tw-min-h-screen tw-bg-iron-950 tw-overflow-x-hidden">
        <div>
          <Header />
          <Breadcrumb breadcrumbs={breadcrumbs} />
        </div>
        {wave && !isError && <WaveDetailed wave={wave} />}
      </main>
    </>
  );
}
