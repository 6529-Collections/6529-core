import SeedWallet from "@/components/core/core-wallet/SeedWallet";
import { getAppMetadata } from "@/components/providers/metadata";
import styles from "@/styles/Home.module.scss";
import { Metadata } from "next";

export default async function SeedWalletPage({
  params,
}: {
  readonly params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  return (
    <main className={styles.main}>
      <div className="tw-relative tw-px-2 lg:tw-px-6 xl:tw-px-8 tw-mx-auto">
        <SeedWallet address={address} />
      </div>
    </main>
  );
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  return getAppMetadata({ title: `6529 Desktop Wallet ${address}` });
}
