import TDHCalculation from "@/components/core/tdh-calculation/TDHCalculation";
import { getAppMetadata } from "@/components/providers/metadata";
import styles from "@/styles/Home.module.scss";
import { Metadata } from "playwright/types/test";

export default function TDHConsensusPage() {
  return (
    <main className={styles.main}>
      <div className="tw-relative tw-px-2 lg:tw-px-6 xl:tw-px-8 tw-mx-auto">
        <TDHCalculation />
      </div>
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "TDH Consensus" });
}
