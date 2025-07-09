import Head from "next/head";
import styles from "@/styles/Home.module.scss";
import dynamic from "next/dynamic";
import { SEIZE_URL } from "@/electron-constants";
import SeedWalletImport from "@/components/core/core-wallet/SeedWalletImport";
import { getAppMetadata } from "@/components/providers/metadata";
import { Metadata } from "next";

export default function SeedWalletPage() {
  return (
    <main className={styles.main}>
      <SeedWalletImport />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "Core Wallets Import" });
}
