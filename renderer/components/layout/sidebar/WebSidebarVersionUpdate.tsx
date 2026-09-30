"use client";

import { useWebVersionUpdate } from "@/components/version-update/useWebVersionUpdate";
import { useRouter } from "next/navigation";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";
import WebSidebarNavItem from "./nav/WebSidebarNavItem";

function UpdateRocketIcon({
  className,
}: {
  readonly className?: string | undefined;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Use the existing local update artwork at sidebar icon size.
    <img
      src="/rocket-refresh-small.png"
      alt=""
      width={24}
      height={24}
      className={className}
    />
  );
}

export default function WebSidebarVersionUpdate({
  collapsed,
}: {
  readonly collapsed: boolean;
}) {
  const surface = useWebVersionUpdate();
  const locale = useBrowserLocale();
  const router = useRouter();
  if (surface !== "sidebar") return null;

  return (
    <WebSidebarNavItem
      onClick={() => router.push("/core/core-info")}
      icon={UpdateRocketIcon}
      active={false}
      collapsed={collapsed}
      label={t(locale, "newVersionToast.update")}
    />
  );
}
