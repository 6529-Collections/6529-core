import styles from "@/styles/Home.module.scss";
import TDHCalculation from "@/components/core/tdh-calculation/TDHCalculation";
import { getAppMetadata } from "@/components/providers/metadata";
import { Metadata } from "playwright/types/test";

export default function TDHConsensusPage() {
  return (
    <main className={styles.main}>
      <TDHCalculation />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "TDH Consensus" });
}
