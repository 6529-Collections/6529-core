"use client";

import { usePathname } from "next/navigation";
import useDeviceInfo from "./hooks/useDeviceInfo";
import Footer from "@/components/footer/Footer";

export default function FooterWrapper() {
  const { isApp } = useDeviceInfo();
  const pathname = usePathname();
  const hideFooter =
    isApp ||
    ["/waves", "/my-stream", "/open-mobile", "/browser-connector"].some(
      (path) => pathname?.startsWith(path)
    );
  return hideFooter ? null : <Footer />;
}
