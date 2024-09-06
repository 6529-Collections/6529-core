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
import { ReactElement, ReactNode, use, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import ReactQueryWrapper from "../components/react-query-wrapper/ReactQueryWrapper";
import CookiesBanner from "../components/cookies/CookiesBanner";
import { CookieConsentProvider } from "../components/cookies/CookieConsentContext";
import { ToastProvider } from "../contexts/ToastContext";
import { useRouter } from "next/router";
import { ConfirmProvider } from "../contexts/ConfirmContext";
import { AboutSection } from "./about/[section]";
import { SeedWalletProvider } from "../contexts/SeedWalletContext";
import { useAnchorInterceptor } from "../hooks/useAnchorInterceptor";

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
  const hideFooter = router.pathname === "/app-wallet";

  const { store, props } = wrapper.useWrappedStore(rest);
  const getLayout = Component.getLayout ?? ((page) => page);

  const [wagmiConfig, setWagmiConfig] = useState<Config>();

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
                      {getLayout(<Component {...props} />)}
                      <CookiesBanner />
                    </CookieConsentProvider>
                  </Auth>
                </ReactQueryWrapper>
                {!hideFooter && (
                  <footer
                    className="d-flex flex-column align-items-center justify-content-center gap-2"
                    id="footer">
                    <span className="d-flex align-items-center justify-content-center flex-wrap gap-2">
                      <a
                        href="https://twitter.com/punk6529"
                        target="_blank"
                        rel="noreferrer">
                        <img
                          width="0"
                          height="0"
                          style={{ height: "18px", width: "auto" }}
                          src="/twitter.png"
                          alt="punk6529 Twitter"
                        />{" "}
                        &#64;punk6529
                      </a>
                      |
                      <a
                        href="https://twitter.com/6529Collections"
                        target="_blank"
                        rel="noreferrer">
                        <img
                          width="0"
                          height="0"
                          style={{ height: "18px", width: "auto" }}
                          src="/twitter.png"
                          alt="6529Collections Twitter"
                        />{" "}
                        &#64;6529Collections
                      </a>
                      |
                      <a
                        href="https://discord.gg/join-om"
                        target="_blank"
                        rel="noreferrer">
                        <img
                          width="0"
                          height="0"
                          style={{ height: "18px", width: "auto" }}
                          src="/discord.png"
                          alt="OM Discord"
                        />{" "}
                        OM Discord
                      </a>
                      |
                      <a
                        href="https://6529.io"
                        target="_blank"
                        rel="noreferrer">
                        <img
                          width="0"
                          height="0"
                          style={{ height: "18px", width: "auto" }}
                          src="/Seize_Logo_2.png"
                          alt="6529.io"
                        />{" "}
                        6529.io
                      </a>
                      |
                      <a
                        href="https://github.com/6529-Collections"
                        target="_blank"
                        rel="noreferrer">
                        <img
                          width="0"
                          height="0"
                          style={{ height: "18px", width: "auto" }}
                          src="/github_w.png"
                          alt="6529-Collections"
                        />{" "}
                        6529-Collections
                      </a>
                    </span>
                    <span className="d-flex align-items-center justify-content-center flex-wrap gap-2">
                      <a href={`/about/${AboutSection.TERMS_OF_SERVICE}`}>
                        Terms of Service
                      </a>
                      |{" "}
                      <a href={`/about/${AboutSection.PRIVACY_POLICY}`}>
                        Privacy Policy
                      </a>
                      |{" "}
                      <a href={`/about/${AboutSection.COPYRIGHT}`}>Copyright</a>
                      |{" "}
                      <a href={`/about/${AboutSection.COOKIE_POLICY}`}>
                        Cookie Policy
                      </a>
                      | <a href={`/about/${AboutSection.LICENSE}`}>License</a>|{" "}
                      <a
                        href="https://api.seize.io/docs"
                        target="_blank"
                        rel="noreferrer">
                        API Documentation
                      </a>
                      |{" "}
                      <a
                        href={`https://status.seize.io/`}
                        target="_blank"
                        rel="noreferrer">
                        Status
                      </a>
                    </span>
                  </footer>
                )}
              </Provider>
              <ReactQueryDevtools initialIsOpen={false} />
            </SeedWalletProvider>
          </ToastProvider>
        </ConfirmProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
