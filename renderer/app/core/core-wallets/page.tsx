import CoreWallets from "@/components/core/core-wallet/SeedWallets";
import { getAppMetadata } from "@/components/providers/metadata";
import styles from "@/styles/Home.module.scss";
import { Metadata } from "next";

export default function SeedWalletPage() {
  return (
    <main className={styles.main}>
      <CoreWallets />
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "6529 Desktop Wallets" });
}
