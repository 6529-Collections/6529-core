import { AppWalletsProvider } from "@/components/app-wallets/AppWalletsContext";
import Auth from "@/components/auth/Auth";
import AuthLaunchTimingReporter from "@/components/auth/AuthLaunchTimingReporter";
import { SeizeConnectProvider } from "@/components/auth/SeizeConnectContext";
import { CookieConsentProvider } from "@/components/cookies/CookieConsentContext";
import { EULAConsentProvider } from "@/components/eula/EULAConsentContext";
import { IpfsProvider } from "@/components/ipfs/IPFSContext";
import QuickDirectMessagesGate from "@/components/messages/quick-dms/QuickDirectMessagesGate";
import { NotificationsProvider } from "@/components/notifications/NotificationsContext";
import ReactQueryWrapper from "@/components/react-query-wrapper/ReactQueryWrapper";
import NewVersionToast from "@/components/utils/NewVersionToast";
import { ActiveGroupProvider } from "@/contexts/ActiveGroupContext";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { EditingDropProvider } from "@/contexts/EditingDropContext";
import { EmojiProvider } from "@/contexts/EmojiContext";
import { HeaderProvider } from "@/contexts/HeaderContext";
import { ModalStateProvider } from "@/contexts/ModalStateContext";
import { NavigationHistoryProvider } from "@/contexts/NavigationHistoryContext";
import { RefreshProvider } from "@/contexts/RefreshContext";
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
import MixpanelSetup from "./MixpanelSetup";
import QueryClientSetup from "./QueryClientSetup";
import WagmiSetup from "./WagmiSetup";

export default function Providers({
  children,
  enableVersionCheck = true,
  enableWalletAuthentication = true,
  enableCookieConsent = true,
  enableMyStream = true,
}: {
  readonly children: React.ReactNode;
  readonly enableVersionCheck?: boolean;
  readonly enableWalletAuthentication?: boolean;
  readonly enableCookieConsent?: boolean;
  readonly enableMyStream?: boolean;
}) {
  const sharedProviders = (
    <TitleProvider>
      <HeaderProvider>
        <SearchProvider>
          <ScrollPositionProvider>
            <ViewProvider>
              <NavigationHistoryProvider>{children}</NavigationHistoryProvider>
            </ViewProvider>
          </ScrollPositionProvider>
        </SearchProvider>
      </HeaderProvider>
    </TitleProvider>
  );

  const appProviders = (
    <QueryClientSetup>
      <AppWalletsProvider>
        <WagmiSetup>
          <CapacitorSetup />
          <AnchorInterceptorSetup />
          <IpfsImageSetup />
          <ReactQueryWrapper>
            <ModalStateProvider>
              <RefreshProvider>
                <SeizeSettingsProvider>
                  <EmojiProvider>
                    <IpfsProvider>
                      <SeizeConnectModalProvider>
                        <SeizeConnectProvider>
                          <ConfirmProvider>
                            <ToastProvider>
                              <SeedWalletProvider>
                                <Auth
                                  enableWalletAuthentication={
                                    enableWalletAuthentication
                                  }
                                >
                                  <AuthLaunchTimingReporter
                                    enableWalletAuthentication={
                                      enableWalletAuthentication
                                    }
                                  />
                                  <WaveEligibilityProvider>
                                    <NotificationsProvider>
                                      <CookieConsentProvider
                                        disabled={!enableCookieConsent}
                                      >
                                        <MixpanelSetup />
                                        <EULAConsentProvider>
                                          <AppWebSocketProvider>
                                            <LayoutProvider>
                                              {enableMyStream ? (
                                                <MyStreamProvider>
                                                  {sharedProviders}
                                                  <QuickDirectMessagesGate />
                                                </MyStreamProvider>
                                              ) : (
                                                sharedProviders
                                              )}
                                            </LayoutProvider>
                                            {enableVersionCheck && (
                                              <NewVersionToast />
                                            )}
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
              </RefreshProvider>
            </ModalStateProvider>
          </ReactQueryWrapper>
        </WagmiSetup>
      </AppWalletsProvider>
    </QueryClientSetup>
  );

  return (
    <EditingDropProvider>
      <ActiveGroupProvider>{appProviders}</ActiveGroupProvider>
    </EditingDropProvider>
  );
}
