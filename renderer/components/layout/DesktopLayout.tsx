"use client";

import { useSearch } from "@/contexts/SearchContext";
import { isElectron } from "@/helpers";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback } from "react";
import { useHeaderContext } from "../../contexts/HeaderContext";
import { useBreadcrumbs } from "../../hooks/useBreadcrumbs";
import { useLayout } from "../brain/my-stream/layout/LayoutContext";
import Breadcrumb from "../breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../header/HeaderPlaceholder";

const Header = dynamic(() => import("../header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

interface DesktopLayoutProps {
  readonly children: ReactNode;
  readonly isSmall?: boolean;
}

const DesktopLayout = ({ children, isSmall }: DesktopLayoutProps) => {
  const { registerRef } = useLayout();
  const { setHeaderRef } = useHeaderContext();

  const breadcrumbs = useBreadcrumbs();
  const pathname = usePathname();
  const isHomePage = pathname === "/";
  const isStreamView = pathname?.startsWith("/my-stream");
  const { containerRef: searchContainerRef } = useSearch();

  const hideHeader = !isElectron();

  const headerWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      registerRef("header", node);
      setHeaderRef(node);
    },
    [registerRef, setHeaderRef]
  );

  return (
    <>
      <div
        ref={headerWrapperRef}
        className={`${
          isStreamView ? "tw-sticky tw-top-0 tw-z-50 tw-bg-black" : ""
        }`}>
        {!hideHeader && <Header isSmall={isSmall} />}
        {!isHomePage && <Breadcrumb breadcrumbs={breadcrumbs} />}
      </div>
      <main ref={searchContainerRef}>{children}</main>
    </>
  );
};

export default DesktopLayout;
