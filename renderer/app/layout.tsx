export const dynamic = "force-dynamic";

import "@/components/drops/create/lexical/lexical.styles.scss";
import "@/styles/Home.module.scss";
import "@/styles/globals.scss";
import "@/styles/seize-bootstrap.scss";
import "@/styles/swiper.scss";

import DynamicHeadTitle from "@/components/dynamic-head/DynamicHeadTitle";
import LayoutWrapper from "@/components/providers/LayoutWrapper";
import Providers from "@/components/providers/Providers";
import StoreSetup from "@/components/providers/StoreSetup";
import { getAppMetadata } from "@/components/providers/metadata";
import { Viewport } from "next";
import { ErrorBoundary } from "react-error-boundary";
import ErrorPage from "./error-page";

export const metadata = getAppMetadata();
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* <AwsRumProvider>  */} {/* NOT IMPLEMENTED in 6529 CORE */}
        <StoreSetup>
          <Providers>
            <DynamicHeadTitle />
            <ErrorBoundary fallback={<ErrorPage />}>
              <LayoutWrapper>{children}</LayoutWrapper>
            </ErrorBoundary>
          </Providers>
        </StoreSetup>
        {/* </AwsRumProvider> */} {/* NOT IMPLEMENTED in 6529 CORE */}
      </body>
    </html>
  );
}
