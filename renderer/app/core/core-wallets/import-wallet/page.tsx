import SeedWalletImport from "@/components/core/core-wallet/SeedWalletImport";
import { getAppMetadata } from "@/components/providers/metadata";
import { Metadata } from "next";

export default function SeedWalletPage() {
  return (
    <main className="tw-min-h-screen">
      <div className="tw-relative tw-mx-auto tw-px-2 lg:tw-px-6 xl:tw-px-8">
        <SeedWalletImport />
      </div>
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "6529 Desktop Wallets Import" });
}
