import { ReactElement } from "react";
import { NextPageWithLayout } from "../_app";
import {
  dehydrate,
  DehydratedState,
  HydrationBoundary,
  QueryClient,
} from "@tanstack/react-query";
import { GetServerSidePropsContext } from "next";
import { getCommonHeaders } from "../../helpers/server.helpers";
import { prefetchAuthenticatedNotifications } from "../../helpers/stream.helpers";
import { Time } from "../../helpers/time";
import { QueryKey } from "../../components/react-query-wrapper/ReactQueryWrapper";
import dynamic from "next/dynamic";

const MyStreamLayout = dynamic(
  () => import("../../components/brain/my-stream/layout/MyStreamLayout"),
  {
    ssr: false,
  }
);
const Notifications = dynamic(
  () => import("../../components/brain/notifications/Notifications"),
  {
    ssr: false,
  }
);

interface Props {
  dehydratedState: DehydratedState;
}

const Page: NextPageWithLayout<{ pageProps: Props }> = ({ pageProps }) => (
  <HydrationBoundary state={pageProps.dehydratedState}>
    <div className="tailwind-scope tw-flex-1">
      <Notifications />
    </div>
  </HydrationBoundary>
);
Page.getLayout = (page: ReactElement) => (
  <MyStreamLayout>{page}</MyStreamLayout>
);

export default Page;
export async function getServerSideProps(
  context: GetServerSidePropsContext
): Promise<{
  props: Props;
}> {
  const queryClient = new QueryClient();
  const headers = getCommonHeaders(context);

  const notificationsFetched =
    context?.req.cookies[[QueryKey.IDENTITY_NOTIFICATIONS].toString()];

  if (
    notificationsFetched &&
    +notificationsFetched < Time.now().toMillis() - 60000
  ) {
    await prefetchAuthenticatedNotifications({ queryClient, headers, context });
  }

  return { props: { dehydratedState: dehydrate(queryClient) } };
}
