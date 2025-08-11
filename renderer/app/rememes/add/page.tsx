import { getAppMetadata } from "@/components/providers/metadata";
import RememeAddPage from "@/components/rememes/RememeAddPage";
import { SEIZE_URL } from "@/electron-constants";
import styles from "@/styles/Home.module.scss";
import type { Metadata } from "next";

export default function ReMemesAddPage() {
  return (
    <main className={styles.main}>
      <RememeAddPage />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({
    title: "ReMemes | Add",
    description: "Collections",
    ogImage: `${SEIZE_URL}/re-memes-b.jpeg`,
  });
}
