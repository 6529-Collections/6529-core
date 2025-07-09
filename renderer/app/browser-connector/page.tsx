import { commonApiFetch } from "@/services/api/common-api";
import BrowserConnectorComponent from "@/components/browser-connector/BrowserConnector";
import { getAppMetadata } from "@/components/providers/metadata";
import { Metadata } from "next";
import { getAppCommonHeaders } from "@/helpers/server.app.helpers";

export default async function BrowserConnectorPage() {
  const headers = await getAppCommonHeaders();
  const image = await commonApiFetch<{
    image: string;
  }>({
    endpoint: "",
    headers,
  }).then(async (response) => response.image);

  return (
    <main
      style={{
        minHeight: "100vh",
      }}>
      <BrowserConnectorComponent image={image} />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "Browser Connector | 6529 Core" });
}
