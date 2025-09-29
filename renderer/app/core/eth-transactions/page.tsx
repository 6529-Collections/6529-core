import ETHScanner from "@/components/core/eth-scanner/ETHScanner";
import { getAppMetadata } from "@/components/providers/metadata";
import styles from "@/styles/Home.module.scss";
import { Metadata } from "next";

export default function ETHScannerPage() {
  return (
    <main className={styles.main}>
      <ETHScanner />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "ETH Transactions" });
}
