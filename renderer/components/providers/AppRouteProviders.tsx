"use client";

import { CookieConsentProvider } from "@/components/cookies/CookieConsentContext";
import { EULAConsentProvider } from "@/components/eula/EULAConsentContext";
import { NotificationsProvider } from "@/components/notifications/NotificationsContext";
import NewVersionToast from "@/components/utils/NewVersionToast";
import { HeaderProvider } from "@/contexts/HeaderContext";
import { NavigationHistoryProvider } from "@/contexts/NavigationHistoryContext";
import { ScrollPositionProvider } from "@/contexts/ScrollPositionContext";
import { SearchProvider } from "@/contexts/SearchContext";
import { TitleProvider } from "@/contexts/TitleContext";
import { MyStreamProvider } from "@/contexts/wave/MyStreamContext";
import { WaveEligibilityProvider } from "@/contexts/wave/WaveEligibilityContext";
import { AppWebSocketProvider } from "@/services/websocket/AppWebSocketProvider";
import { usePathname } from "next/navigation";
import { LayoutProvider } from "../brain/my-stream/layout/LayoutContext";
import { ViewProvider } from "../navigation/ViewContext";
import MixpanelSetup from "./MixpanelSetup";

export default function AppRouteProviders({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isBrowserConnectorRoute =
    pathname?.startsWith("/browser-connector") === true;

  if (isBrowserConnectorRoute) {
    return <TitleProvider>{children}</TitleProvider>;
  }

  return (
    <WaveEligibilityProvider>
      <NotificationsProvider>
        <CookieConsentProvider>
          <MixpanelSetup />
          <EULAConsentProvider>
            <AppWebSocketProvider>
              <LayoutProvider>
                <MyStreamProvider>
                  <TitleProvider>
                    <HeaderProvider>
                      <SearchProvider>
                        <ScrollPositionProvider>
                          <ViewProvider>
                            <NavigationHistoryProvider>
                              {children}
                            </NavigationHistoryProvider>
                          </ViewProvider>
                        </ScrollPositionProvider>
                      </SearchProvider>
                    </HeaderProvider>
                  </TitleProvider>
                </MyStreamProvider>
              </LayoutProvider>
              <NewVersionToast />
            </AppWebSocketProvider>
          </EULAConsentProvider>
        </CookieConsentProvider>
      </NotificationsProvider>
    </WaveEligibilityProvider>
  );
}
