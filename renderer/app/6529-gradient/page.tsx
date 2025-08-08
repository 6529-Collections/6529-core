import GradientsComponent from "@/components/6529Gradient/6529Gradient";
import { getAppMetadata } from "@/components/providers/metadata";
import { SEIZE_URL } from "@/electron-constants";
import styles from "@/styles/Home.module.scss";
import { Metadata } from "next";

export default function GradientsPage() {
  return (
    <main className={styles.main}>
      <GradientsComponent />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({
    title: "6529 Gradient",
    description: "Collections",
    ogImage: `${SEIZE_URL}/gradients-preview.png`,
    twitterCard: "summary_large_image",
  });
}
