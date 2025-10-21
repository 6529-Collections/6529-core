import AppInfo from "@/components/core/app-info/AppInfo";
import { getAppMetadata } from "@/components/providers/metadata";
import styles from "@/styles/Home.module.scss";
import { Metadata } from "next";

export default function AppInfoPage() {
  return (
    <main className={styles.main}>
      <AppInfo />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "6529 Desktop Info" });
}
