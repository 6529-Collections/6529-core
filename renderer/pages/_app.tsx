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

import { library } from "@fortawesome/fontawesome-svg-core";

import {
  faArrowUp,
  faArrowDown,
  faCopy,
  faCaretRight,
  faCaretLeft,
  faExchange,
  faShoppingCart,
  faCircleChevronUp,
  faCircleChevronDown,
  faSquareCaretUp,
  faSquareCaretDown,
  faParachuteBox,
  faDownload,
  faChevronCircleUp,
  faChevronCircleDown,
  faChevronCircleLeft,
  faChevronCircleRight,
  faExpandAlt,
  faBars,
  faEye,
  faEyeSlash,
  faCheck,
  faXmark,
  faCartPlus,
  faTimesCircle,
  faLink,
  faSearch,
  faX,
  faSquareXmark,
  faChevronUp,
  faLock,
  faLockOpen,
  faPlus,
  faMinus,
  faCaretDown,
  faCircleArrowLeft,
  faInfoCircle,
  faArrowsTurnRight,
  faCheckCircle,
  faFileUpload,
  faUser,
  faArrowCircleDown,
  faExternalLinkSquare,
  faPlusCircle,
  faXmarkCircle,
  faFire,
  faGlobe,
  faExternalLink,
  faFileCsv,
  faRefresh,
  faImage,
  faWallet,
  faGear,
  faArrowCircleLeft,
  faArrowRightFromBracket,
  faGasPump,
  faFaceGrinWide,
  faFaceSmile,
  faFrown,
  faArrowCircleRight,
  faTowerBroadcast,
  faLightbulb,
  faMaximize,
  faPlayCircle,
  faPauseCircle,
  faSpinner,
  faFilter,
  faFilterCircleXmark,
  faMagnifyingGlass,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faPlusSquare,
  faMinusSquare,
  faChevronDown,
  faEdit,
  faAnglesDown,
  faAnglesUp,
} from "@fortawesome/free-solid-svg-icons";
import Head from "next/head";
import Auth from "../components/auth/Auth";
import { NextPage, NextPageContext } from "next";
import { ReactElement, ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactQueryWrapper from "../components/react-query-wrapper/ReactQueryWrapper";
import "../components/drops/create/lexical/lexical.styles.scss";
import { CookieConsentProvider } from "../components/cookies/CookieConsentContext";
import { ToastProvider } from "../contexts/ToastContext";
import { useRouter } from "next/router";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { SeedWalletProvider } from "../contexts/SeedWalletContext";
import { useAnchorInterceptor } from "../hooks/useAnchorInterceptor";
import { ModalStateProvider } from "../contexts/ModalStateContext";
import { SeizeConnectModalProvider } from "../contexts/SeizeConnectModalContext";
import Footer from "../components/footer/Footer";
import { SeizeConnectProvider } from "../components/auth/SeizeConnectContext";
import { IpfsProvider, resolveIpfsUrl } from "../components/ipfs/IPFSContext";
import { EULAConsentProvider } from "../components/eula/EULAConsentContext";
import { AppWalletsProvider } from "../components/app-wallets/AppWalletsContext";
import { SeizeSettingsProvider } from "../contexts/SeizeSettingsContext";
import { EmojiProvider } from "../contexts/EmojiContext";
import { AppWebSocketProvider } from "../services/websocket/AppWebSocketProvider";

library.add(
  faArrowUp,
  faArrowDown,
  faCircleArrowLeft,
  faCopy,
  faCaretRight,
  faCaretLeft,
  faExchange,
  faShoppingCart,
  faSquareCaretUp,
  faSquareCaretDown,
  faCircleChevronUp,
  faCircleChevronDown,
  faChevronCircleUp,
  faChevronCircleDown,
  faChevronCircleLeft,
  faChevronCircleRight,
  faParachuteBox,
  faDownload,
  faExpandAlt,
  faBars,
  faEye,
  faEyeSlash,
  faCheck,
  faXmark,
  faCartPlus,
  faTimesCircle,
  faLink,
  faSearch,
  faX,
  faSquareXmark,
  faChevronUp,
  faLock,
  faLockOpen,
  faMinus,
  faPlus,
  faCaretDown,
  faMinus,
  faInfoCircle,
  faArrowsTurnRight,
  faCheckCircle,
  faFileUpload,
  faUser,
  faArrowCircleDown,
  faExternalLinkSquare,
  faPlusCircle,
  faXmarkCircle,
  faFire,
  faGlobe,
  faExternalLink,
  faFileCsv,
  faRefresh,
  faImage,
  faWallet,
  faGear,
  faArrowCircleLeft,
  faArrowCircleRight,
  faArrowRightFromBracket,
  faGasPump,
  faFaceGrinWide,
  faFaceSmile,
  faFrown,
  faTowerBroadcast,
  faLightbulb,
  faMaximize,
  faPlayCircle,
  faPauseCircle,
  faSpinner,
  faFilter,
  faFilterCircleXmark,
  faCheckCircle,
  faMagnifyingGlass,
  faMagnifyingGlassMinus,
  faMagnifyingGlassPlus,
  faPlusSquare,
  faMinusSquare,
  faChevronDown,
  faEdit,
  faAnglesDown,
  faAnglesUp
);

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
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout<NextPageContext>;
};

export default function App({ Component, ...rest }: AppPropsWithLayout) {
  const router = useRouter();
  useAnchorInterceptor();

  const hideFooter =
    router.pathname === "/app-wallet" || router.pathname.startsWith("/waves");

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
    getWagmiConfig().then((c) => setWagmiConfig(c));
  }, []);

  useEffect(() => {
    const updateWagmiConfig = () => {
      getWagmiConfig().then((c) => setWagmiConfig(c));
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
                                      {getLayout(<Component {...props} />)}
                                    </EULAConsentProvider>
                                  </CookieConsentProvider>
                                </Auth>
                              </ReactQueryWrapper>
                              {!hideFooter && <Footer />}
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
