"use client";

import FooterWrapper from "@/FooterWrapper";
import DesktopLayout from "@/components/layout/DesktopLayout";
import MobileLayout from "@/components/layout/MobileLayout";
import useDeviceInfo from "@/hooks/useDeviceInfo";
import { usePathname } from "next/navigation";
import { useMemo } from "react";

export default function LayoutWrapper({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const { isApp } = useDeviceInfo();
  const pathname = usePathname();

  const isSmall = pathname?.startsWith("/my-stream");
  const isAccessOrRestricted =
    pathname?.startsWith("/access") || pathname?.startsWith("/restricted");

  const content = useMemo(() => {
    return isApp ? (
      <MobileLayout>{children}</MobileLayout>
    ) : (
      <DesktopLayout isSmall={isSmall}>{children}</DesktopLayout>
    );
  }, [isApp, isSmall, children]);

  if (isAccessOrRestricted) {
    return <>{children}</>;
  }

  return (
    <>
      {content}
      <FooterWrapper />
    </>
  );
}
