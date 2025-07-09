import styles from "@/styles/Home.module.scss";
import CoreWallets from "@/components/core/core-wallet/SeedWallets";
import { Metadata } from "next";
import { getAppMetadata } from "@/components/providers/metadata";

export default function SeedWalletPage() {
  return (
    <main className={styles.main}>
      <CoreWallets />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "Core Wallets" });
}
