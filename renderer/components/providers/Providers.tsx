import { AppWalletsProvider } from "@/components/app-wallets/AppWalletsContext";
import Auth from "@/components/auth/Auth";
import { SeizeConnectProvider } from "@/components/auth/SeizeConnectContext";
import { CookieConsentProvider } from "@/components/cookies/CookieConsentContext";
import { EULAConsentProvider } from "@/components/eula/EULAConsentContext";
import { IpfsProvider } from "@/components/ipfs/IPFSContext";
import { NotificationsProvider } from "@/components/notifications/NotificationsContext";
import ReactQueryWrapper from "@/components/react-query-wrapper/ReactQueryWrapper";
import NewVersionToast from "@/components/utils/NewVersionToast";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { EmojiProvider } from "@/contexts/EmojiContext";
import { HeaderProvider } from "@/contexts/HeaderContext";
import { ModalStateProvider } from "@/contexts/ModalStateContext";
import { NavigationHistoryProvider } from "@/contexts/NavigationHistoryContext";
import { ScrollPositionProvider } from "@/contexts/ScrollPositionContext";
import { SearchProvider } from "@/contexts/SearchContext";
import { SeedWalletProvider } from "@/contexts/SeedWalletContext";
import { SeizeConnectModalProvider } from "@/contexts/SeizeConnectModalContext";
import { SeizeSettingsProvider } from "@/contexts/SeizeSettingsContext";
import { TitleProvider } from "@/contexts/TitleContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { MyStreamProvider } from "@/contexts/wave/MyStreamContext";
import { WaveEligibilityProvider } from "@/contexts/wave/WaveEligibilityContext";
import { AppWebSocketProvider } from "@/services/websocket/AppWebSocketProvider";
import { LayoutProvider } from "../brain/my-stream/layout/LayoutContext";
import { ViewProvider } from "../navigation/ViewContext";
import AnchorInterceptorSetup from "./AnchorInterceptorSetup";
import CapacitorSetup from "./CapacitorSetup";
import IpfsImageSetup from "./IpfsImageSetup";
import QueryClientSetup from "./QueryClientSetup";
import WagmiSetup from "./WagmiSetup";

export default function Providers({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <QueryClientSetup>
      <AppWalletsProvider>
        <WagmiSetup>
          <CapacitorSetup />
          <AnchorInterceptorSetup />
          <IpfsImageSetup />
          <ReactQueryWrapper>
            <ModalStateProvider>
              <SeizeSettingsProvider>
                <EmojiProvider>
                  <IpfsProvider>
                    <SeizeConnectModalProvider>
                      <SeizeConnectProvider>
                        <ConfirmProvider>
                          <ToastProvider>
                            <SeedWalletProvider>
                              <Auth>
                                <WaveEligibilityProvider>
                                  <NotificationsProvider>
                                    <CookieConsentProvider>
                                      <EULAConsentProvider>
                                        <AppWebSocketProvider>
                                          <TitleProvider>
                                            <HeaderProvider>
                                              <SearchProvider>
                                                <ScrollPositionProvider>
                                                  <ViewProvider>
                                                    <NavigationHistoryProvider>
                                                      <LayoutProvider>
                                                        <MyStreamProvider>
                                                          {children}
                                                        </MyStreamProvider>
                                                      </LayoutProvider>
                                                    </NavigationHistoryProvider>
                                                  </ViewProvider>
                                                </ScrollPositionProvider>
                                              </SearchProvider>
                                            </HeaderProvider>
                                          </TitleProvider>
                                          <NewVersionToast />
                                        </AppWebSocketProvider>
                                      </EULAConsentProvider>
                                    </CookieConsentProvider>
                                  </NotificationsProvider>
                                </WaveEligibilityProvider>
                              </Auth>
                            </SeedWalletProvider>
                          </ToastProvider>
                        </ConfirmProvider>
                      </SeizeConnectProvider>
                    </SeizeConnectModalProvider>
                  </IpfsProvider>
                </EmojiProvider>
              </SeizeSettingsProvider>
            </ModalStateProvider>
          </ReactQueryWrapper>
        </WagmiSetup>
      </AppWalletsProvider>
    </QueryClientSetup>
  );
}
