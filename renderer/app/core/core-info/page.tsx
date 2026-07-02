import AppInfo from "@/components/core/app-info/AppInfo";
import { getAppMetadata } from "@/components/providers/metadata";
import { Metadata } from "next";

export default function AppInfoPage() {
  return (
    <main className="tw-min-h-screen">
      <div className="tw-relative tw-mx-auto tw-px-2 lg:tw-px-6 xl:tw-px-8">
        <AppInfo />
      </div>
    </main>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "6529 Desktop Info" });
}
