"use client";

import { usePathname } from "next/navigation";
import { getAppRouteProviderFeatures } from "./app-route-provider-features";
import Providers from "./Providers";

export default function AppRouteProviders({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const providerFeatures = getAppRouteProviderFeatures(pathname);

  return <Providers {...providerFeatures}>{children}</Providers>;
}
