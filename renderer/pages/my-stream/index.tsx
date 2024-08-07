import { ReactElement } from "react";
import { NextPageWithLayout } from "../_app";
import MyStreamLayout from "../../components/brain/my-stream/layout/MyStreamLayout";

import MyStream from "../../components/brain/my-stream/MyStream";

const Page: NextPageWithLayout<{}> = () => (
  <div className="tailwind-scope">
    <MyStream />
  </div>
);
Page.getLayout = (page: ReactElement) => (
  <MyStreamLayout>{page}</MyStreamLayout>
);

export default Page;
