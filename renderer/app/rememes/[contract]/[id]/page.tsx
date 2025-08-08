import { getAppMetadata } from "@/components/providers/metadata";
import RememePage from "@/components/rememes/RememePage";
import { SEIZE_API_URL, SEIZE_URL } from "@/electron-constants";
import { formatAddress } from "@/helpers/Helpers";
import { fetchUrl } from "@/services/6529api";
import styles from "@/styles/Home.module.scss";
import type { Metadata } from "next";

export default async function ReMeme({
  params,
}: {
  readonly params: Promise<{ contract: string; id: string }>;
}) {
  const { contract, id } = await params;

  return (
    <main className={styles.main}>
      <RememePage contract={contract} id={id} />
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ contract: string; id: string }>;
}): Promise<Metadata> {
  const { contract, id } = await params;
  let name = `${formatAddress(contract)} #${id}`;
  let image = `${SEIZE_URL}/6529io.png`;
  const response = await fetchUrl(
    `${SEIZE_API_URL}/api/rememes?contract=${contract}&id=${id}`
  );

  if (response?.data?.length > 0) {
    if (response.data[0].metadata?.name) {
      name = response.data[0].metadata.name;
    }
    if (response.data[0].image) {
      image = response.data[0].image;
    }
  }

  return getAppMetadata({
    title: name,
    ogImage: image ?? `${SEIZE_URL}/re-memes-b.jpeg`,
    description: `ReMemes`,
    twitterCard: "summary",
  });
}
