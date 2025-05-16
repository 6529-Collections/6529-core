import "../styles/seize-bootstrap.scss";
import "../styles/globals.scss";
import "tippy.js/dist/tippy.css";
import "tippy.js/themes/light.css";
import "../styles/swiper.scss";
import "../components/drops/create/lexical/lexical.styles.scss";
import { Provider } from "react-redux";
import type { AppProps } from "next/app";
import { wrapper } from "../store/store";

import { Config, WagmiProvider } from "wagmi";
import { getWagmiConfig } from "../wagmiConfig";

import Head from "next/head";
import Auth from "../components/auth/Auth";
import { NextPage, NextPageContext } from "next";
import { ReactElement, ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactQueryWrapper from "../components/react-query-wrapper/ReactQueryWrapper";
import "../components/drops/create/lexical/lexical.styles.scss";
import { CookieConsentProvider } from "../components/cookies/CookieConsentContext";
import { ToastProvider } from "../contexts/ToastContext";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { SeedWalletProvider } from "../contexts/SeedWalletContext";
import { useAnchorInterceptor } from "../hooks/useAnchorInterceptor";
import { ModalStateProvider } from "../contexts/ModalStateContext";
import { SeizeConnectModalProvider } from "../contexts/SeizeConnectModalContext";
import { SeizeConnectProvider } from "../components/auth/SeizeConnectContext";
import { IpfsProvider, resolveIpfsUrl } from "../components/ipfs/IPFSContext";
import { EULAConsentProvider } from "../components/eula/EULAConsentContext";
import { AppWalletsProvider } from "../components/app-wallets/AppWalletsContext";
import { SeizeSettingsProvider } from "../contexts/SeizeSettingsContext";
import { EmojiProvider } from "../contexts/EmojiContext";
import { AppWebSocketProvider } from "../services/websocket/AppWebSocketProvider";
import MainLayout from "../components/layout/MainLayout";
import { HeaderProvider } from "../contexts/HeaderContext";
import { PageSSRMetadata } from "../helpers/Types";
import { SEIZE_URL } from "../../constants";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000,
      refetchOnWindowFocus: false,
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

export type NextPageWithLayout<Props> = NextPage<Props> & {
  getLayout?: (page: ReactElement<any>) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout<NextPageContext>;
};

export default function App({ Component, ...rest }: AppPropsWithLayout) {
  const router = useRouter();
  useAnchorInterceptor();

  const TitleBarDynamic = dynamic(() => import("../TitleBarWrapper"), {
    ssr: false,
  });

  const FooterDynamic = dynamic(() => import("../FooterWrapper"), {
    ssr: false,
  });

  const { store, props } = wrapper.useWrappedStore(rest);

  const getLayout = Component.getLayout ?? ((page) => page);

  const [wagmiConfig, setWagmiConfig] = useState<Config>();

  const updateImagesSrc = async () => {
    const elementsWithSrc = document.querySelectorAll("[src]");
    Array.from(elementsWithSrc).forEach(async (el) => {
      const src = el.getAttribute("src")!;
      const newSrc = await resolveIpfsUrl(src);
      if (newSrc !== src) {
        el.setAttribute("src", newSrc);
      }
    });
  };

  useEffect(() => {
    updateImagesSrc();

    const observer = new MutationObserver(() => {
      updateImagesSrc();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    import("../wagmiConfig").then(({ getWagmiConfig }) => {
      getWagmiConfig().then((c) => setWagmiConfig(c));
    });
  }, []);

  useEffect(() => {
    const updateWagmiConfig = () => {
      import("../wagmiConfig").then(({ getWagmiConfig }) => {
        getWagmiConfig().then((c) => setWagmiConfig(c));
      });
    };

    window.api?.onSeedWalletsChange(updateWagmiConfig);
    updateWagmiConfig();

    return () => {
      window.api?.offSeedWalletsChange(updateWagmiConfig);
    };
  }, []);

  if (!wagmiConfig) {
    return <></>;
  }

  const pageMetadata = rest.pageProps.metadata;
  const componentMetadata = (Component as any).metadata;
  const isStaging = SEIZE_URL.includes("staging");
  const metadata: PageSSRMetadata = {
    title:
      componentMetadata?.title ??
      pageMetadata?.title ??
      (isStaging ? "6529 Staging" : "6529"),
    description:
      componentMetadata?.description ?? pageMetadata?.description ?? "",
    ogImage:
      componentMetadata?.ogImage ??
      pageMetadata?.ogImage ??
      `${SEIZE_URL}/6529io.png`,
    twitterCard:
      componentMetadata?.twitterCard ?? pageMetadata?.twitterCard ?? "summary",
  };
  metadata.description = `${
    metadata.description ? `${metadata.description} | ` : ""
  }${isStaging ? "6529 Staging Core" : "6529 Core"}`;

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ModalStateProvider>
          <SeizeSettingsProvider>
            <EmojiProvider>
              <IpfsProvider>
                <AppWalletsProvider>
                  <SeizeConnectModalProvider>
                    <SeizeConnectProvider>
                      <ConfirmProvider>
                        <ToastProvider>
                          <SeedWalletProvider>
                            <Provider store={store}>
                              <Head>
                                <meta
                                  name="viewport"
                                  content="width=device-width, initial-scale=1.0, maximum-scale=1"
                                />
                              </Head>
                              <ReactQueryWrapper>
                                <Auth>
                                  <CookieConsentProvider>
                                    <EULAConsentProvider>
                                      <AppWebSocketProvider>
                                        <HeaderProvider>
                                          <MainLayout metadata={metadata}>
                                            <TitleBarDynamic />
                                            {getLayout(
                                              <Component
                                                {...props}
                                                key={
                                                  router.asPath.split("?")[0]
                                                }
                                              />
                                            )}
                                          </MainLayout>
                                        </HeaderProvider>
                                      </AppWebSocketProvider>
                                    </EULAConsentProvider>
                                  </CookieConsentProvider>
                                </Auth>
                              </ReactQueryWrapper>
                              <FooterDynamic />
                            </Provider>
                          </SeedWalletProvider>
                        </ToastProvider>
                      </ConfirmProvider>
                    </SeizeConnectProvider>
                  </SeizeConnectModalProvider>
                </AppWalletsProvider>
              </IpfsProvider>
            </EmojiProvider>
          </SeizeSettingsProvider>
        </ModalStateProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
