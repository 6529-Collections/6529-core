// Side effect: Overrides globalThis.fetch on server-side to automatically
// add auth headers (x-6529-internal-*) for rate limiter/WAF bypass
import "@/lib/fetch/ssrFetch";
import "@/components/drops/create/lexical/lexical.styles.css";
import "@/styles/Home.module.css";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "@/styles/swiper.css";
import "@/styles/wave-navigation-transition.css";
//keep this last so that we can override the styles of the above css files
import "@/styles/animations.css";
import "@/styles/globals.css";

import DynamicHeadTitle from "@/components/dynamic-head/DynamicHeadTitle";
import AwsRumProvider from "@/components/monitoring/AwsRumProvider";
import MobileLaunchTimingReporter from "@/components/monitoring/MobileLaunchTimingReporter";
import AppRouteProviders from "@/components/providers/AppRouteProviders";
import LayoutWrapper from "@/components/providers/LayoutWrapper";
import {
  SIDEBAR_STARTUP_SCRIPT,
  SIDEBAR_STARTUP_STYLES,
} from "@/components/layout/sidebarStartup";
import {
  SMALL_WEB_STARTUP_SCRIPT,
  SMALL_WEB_STARTUP_STYLES,
} from "@/components/layout/smallWebStartup";
import { getAppMetadata } from "@/components/providers/metadata";
import { publicEnv } from "@/config/env";
import type { Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { getMediaResolverSource } from "@/lib/media/decentralized-media";

export const fetchCache = "force-no-store";

// Loaded here so every route preloads the font from the HTML instead of
// discovering it from the stylesheet, with a size-adjusted fallback while it
// swaps in. The variable name becomes the generated family name
// ("Montserrat"), which font checks in tests rely on; styles use it through
// --font-montserrat.
const Montserrat = localFont({
  src: "../assets/montserrat/Montserrat-VariableFont_wght.woff2",
  display: "swap",
  variable: "--font-montserrat",
});

export const metadata = getAppMetadata();
export const viewport: Viewport = {
  width: "device-width",
  viewportFit: "cover",
  userScalable: true,
  initialScale: 1,
  maximumScale: 10,
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const isUsingStaticAssets = publicEnv.ASSETS_FROM_S3 === "true";

  return (
    // Headless UI may add its focus-visible marker before React hydrates when
    // keyboard input arrives during startup. Keep that root-only mutation.
    <html
      lang="en-US"
      className={Montserrat.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: SMALL_WEB_STARTUP_STYLES }} />
        <script
          id="small-web-startup-bootstrap"
          dangerouslySetInnerHTML={{ __html: SMALL_WEB_STARTUP_SCRIPT }}
        />
        <style dangerouslySetInnerHTML={{ __html: SIDEBAR_STARTUP_STYLES }} />
        <script
          id="sidebar-startup-bootstrap"
          dangerouslySetInnerHTML={{ __html: SIDEBAR_STARTUP_SCRIPT }}
        />
        <link rel="preconnect" href={publicEnv.API_ENDPOINT} crossOrigin="" />
        <link rel="preconnect" href="https://d3lqz0a4bldqgf.cloudfront.net" />
        <link
          rel="preconnect"
          href={getMediaResolverSource(publicEnv.MEDIA_RESOLVER_ENDPOINT)}
        />
        {isUsingStaticAssets && (
          <>
            <link
              rel="preconnect"
              href="https://dnclu2fna0b2b.cloudfront.net"
            />
            {/* Fonts are CORS requests and cannot reuse the connection above. */}
            <link
              rel="preconnect"
              href="https://dnclu2fna0b2b.cloudfront.net"
              crossOrigin=""
            />
          </>
        )}
      </head>
      {/* The touch-first helper may restore data-fine-pointer before hydration. */}
      <body suppressHydrationWarning>
        <MobileLaunchTimingReporter />
        <AwsRumProvider>
          {/* Core's client shell reads the live URL in analytics, title, wave,
              and navigation providers. Keep those reads below a boundary when
              Next prerenders static routes, unlike the request-time web shell. */}
          <Suspense fallback={null}>
            <AppRouteProviders>
              <DynamicHeadTitle />
              <LayoutWrapper>{children}</LayoutWrapper>
            </AppRouteProviders>
          </Suspense>
        </AwsRumProvider>
      </body>
    </html>
  );
}
