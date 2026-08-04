export type AppRouteProviderFeatures = Readonly<{
  enableVersionCheck: boolean;
  enableWalletAuthentication: boolean;
  enableCookieConsent: boolean;
  enableMyStream: boolean;
}>;

const DEFAULT_PROVIDER_FEATURES: AppRouteProviderFeatures = {
  enableVersionCheck: true,
  enableWalletAuthentication: true,
  enableCookieConsent: true,
  enableMyStream: true,
};

const BROWSER_CONNECTOR_PROVIDER_FEATURES: AppRouteProviderFeatures = {
  enableVersionCheck: false,
  enableWalletAuthentication: false,
  enableCookieConsent: false,
  enableMyStream: false,
};

export function isBrowserConnectorRoute(
  pathname: string | null | undefined
): boolean {
  return (
    pathname === "/browser-connector" ||
    pathname?.startsWith("/browser-connector/") === true
  );
}

export function getAppRouteProviderFeatures(
  pathname: string | null | undefined
): AppRouteProviderFeatures {
  return isBrowserConnectorRoute(pathname)
    ? BROWSER_CONNECTOR_PROVIDER_FEATURES
    : DEFAULT_PROVIDER_FEATURES;
}
