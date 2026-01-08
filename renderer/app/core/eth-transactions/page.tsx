import ETHScanner from "@/components/core/eth-scanner/ETHScanner";
import { getAppMetadata } from "@/components/providers/metadata";
import styles from "@/styles/Home.module.scss";
import { Metadata } from "next";

export default function ETHScannerPage() {
  return (
    <main className={styles["main"]}>
      <div className="tw-relative tw-mx-auto tw-px-2 lg:tw-px-6 xl:tw-px-8">
        <ETHScanner />
      </div>
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "ETH Transactions" });
}
