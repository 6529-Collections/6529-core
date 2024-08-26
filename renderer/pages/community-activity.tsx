import Head from "next/head";
import {
  getCommonHeaders,
  getUserProfileActivityLogs,
} from "../helpers/server.helpers";
import { CountlessPage } from "../helpers/Types";
import { ProfileActivityLog } from "../entities/IProfile";
import ProfileActivityLogs, {
  ActivityLogParams,
  convertActivityLogParams,
} from "../components/profile-activity/ProfileActivityLogs";
import { FilterTargetType } from "../components/utils/CommonFilterTargetSelect";
import { useContext } from "react";
import { ReactQueryWrapperContext } from "../components/react-query-wrapper/ReactQueryWrapper";
import { Crumb } from "../components/breadcrumb/Breadcrumb";
import SidebarLayout from "../components/utils/sidebar/SidebarLayout";
import { getProfileLogTypes } from "../helpers/profile-logs.helpers";
import { SEIZE_URL } from "../../constants";

const INITIAL_ACTIVITY_LOGS_PARAMS: ActivityLogParams = {
  page: 1,
  pageSize: 50,
  logTypes: getProfileLogTypes({
    logTypes: [],
  }),
  matter: null,
  targetType: FilterTargetType.ALL,
  handleOrWallet: null,
  groupId: null,
};

export interface CommunityActivityPage {
  readonly logsPage: CountlessPage<ProfileActivityLog>;
}

export default function CommunityActivityPage({
  pageProps,
}: {
  readonly pageProps: CommunityActivityPage;
}) {
  const breadcrumbs: Crumb[] = [
    { display: "Home", href: "/" },
    { display: "Community Activity" },
  ];

  const { initCommunityActivityPage } = useContext(ReactQueryWrapperContext);
  initCommunityActivityPage({
    activityLogs: {
      data: pageProps.logsPage,
      params: INITIAL_ACTIVITY_LOGS_PARAMS,
    },
  });

  return (
    <>
      <Head>
        <title>Profiles Activity | 6529 CORE</title>
        <link rel="icon" href="/favicon.ico" />
        <meta name="description" content="Profiles Activity | 6529 CORE" />
        <meta property="og:url" content={`${SEIZE_URL}/profiles-activity`} />
        <meta property="og:title" content="Profiles Activity" />
        <meta
          property="og:image"
          content={`${SEIZE_URL}/Seize_Logo_Glasses_2.png`}
        />
        <meta property="og:description" content="6529 CORE" />
      </Head>

      <SidebarLayout breadcrumbs={breadcrumbs}>
        <ProfileActivityLogs
          initialParams={INITIAL_ACTIVITY_LOGS_PARAMS}
          withFilters={true}>
          <h1 className="tw-block tw-float-none tw-whitespace-nowrap">
            <span className="font-lightest">Community</span> Activity
          </h1>
        </ProfileActivityLogs>
      </SidebarLayout>
    </>
  );
}

export async function getServerSideProps(
  req: any,
  res: any,
  resolvedUrl: any
): Promise<{
  props: CommunityActivityPage;
}> {
  try {
    const headers = getCommonHeaders(req);
    const logsPage = await getUserProfileActivityLogs({
      headers,
      params: convertActivityLogParams({
        params: INITIAL_ACTIVITY_LOGS_PARAMS,
        disableActiveGroup: true,
      }),
    });
    return {
      props: {
        logsPage,
      },
    };
  } catch (e: any) {
    return {
      redirect: {
        permanent: false,
        destination: "/404",
      },
      props: {},
    } as any;
  }
}
