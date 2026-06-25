import { AppWalletsProvider } from "@/components/app-wallets/AppWalletsContext";
import Auth from "@/components/auth/Auth";
import { SeizeConnectProvider } from "@/components/auth/SeizeConnectContext";
import { IpfsProvider } from "@/components/ipfs/IPFSContext";
import ReactQueryWrapper from "@/components/react-query-wrapper/ReactQueryWrapper";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import { EmojiProvider } from "@/contexts/EmojiContext";
import { ModalStateProvider } from "@/contexts/ModalStateContext";
import { RefreshProvider } from "@/contexts/RefreshContext";
import { SeedWalletProvider } from "@/contexts/SeedWalletContext";
import { SeizeConnectModalProvider } from "@/contexts/SeizeConnectModalContext";
import { SeizeSettingsProvider } from "@/contexts/SeizeSettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import AnchorInterceptorSetup from "./AnchorInterceptorSetup";
import AppRouteProviders from "./AppRouteProviders";
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
              <RefreshProvider>
                <SeizeSettingsProvider>
                  <EmojiProvider>
                    <IpfsProvider>
                      <SeizeConnectModalProvider>
                        <SeizeConnectProvider>
                          <ConfirmProvider>
                            <ToastProvider>
                              <SeedWalletProvider>
                                <Auth>
                                  <AppRouteProviders>
                                    {children}
                                  </AppRouteProviders>
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
}
