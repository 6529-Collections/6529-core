import Head from "next/head";
import styles from "@/styles/Home.module.scss";
import dynamic from "next/dynamic";
import { SEIZE_URL } from "@/electron-constants";
import ETHScanner from "@/components/core/eth-scanner/ETHScanner";
import { Metadata } from "next";
import { getAppMetadata } from "@/components/providers/metadata";

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
