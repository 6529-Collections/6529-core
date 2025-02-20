import { ReactNode, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { createBreakpoint } from "react-use";

import Breadcrumb, { Crumb } from "../../breadcrumb/Breadcrumb";
import HeaderPlaceholder from "../../header/HeaderPlaceholder";
import GroupsSidebarToggleButton from "../../groups/sidebar/GroupsSidebarToggleButton";
import GroupsSidebar from "../../groups/sidebar/GroupsSidebar";
import {
  selectActiveGroupId,
  setActiveGroupId,
} from "../../../store/groupSlice";

const Header = dynamic(() => import("../../header/Header"), {
  ssr: false,
  loading: () => <HeaderPlaceholder />,
});

const BREAKPOINTS = { XXL: 2048, MD: 768, S: 0 };

interface SidebarLayoutProps {
  readonly breadcrumbs: Crumb[];
  readonly children: ReactNode;
}

export default function SidebarLayout({
  breadcrumbs,
  children,
}: SidebarLayoutProps) {
  const useBreakpoint = createBreakpoint(BREAKPOINTS);
  const breakpoint = useBreakpoint();
  const router = useRouter();
  const dispatch = useDispatch();

  const activeGroupId = useSelector(selectActiveGroupId);

  const headerRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const [shouldAnimateContentMargin, setShouldAnimateContentMargin] =
    useState<boolean>(false);

  useEffect(() => {
    if (breakpoint === "S") {
      setIsSidebarOpen(false);
    }
  }, [breakpoint]);

  useEffect(() => {
    const animate = !["XXL", "S"].includes(breakpoint) && isSidebarOpen;
    setShouldAnimateContentMargin(animate);
  }, [breakpoint, isSidebarOpen]);

  useEffect(() => {
    if (router.isReady && !isInitialized) {
      const { group } = router.query as { group?: string };
      if (group && group !== activeGroupId) {
        dispatch(setActiveGroupId(group));
      }
      setIsInitialized(true);
    }
  }, [router.isReady, router.query, activeGroupId, isInitialized, dispatch]);

  useEffect(() => {
    const updateHeaderHeight = () => {
      if (headerRef.current) {
        const { height } = headerRef.current.getBoundingClientRect();
        document.documentElement.style.setProperty(
          "--header-height",
          `${height}px`
        );
      }
    };

    updateHeaderHeight();
    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="tailwind-scope tw-min-h-screen tw-bg-iron-950 tw-overflow-x-hidden">
      <div
        ref={headerRef}
        className="tw-fixed tw-top-0 tw-left-0 tw-right-0 tw-z-50 tw-bg-iron-950"
      >
        <Header />
        <Breadcrumb breadcrumbs={breadcrumbs} />
      </div>

      <div className="tw-pt-[var(--header-height,0px)]">
        <div
          className={`tw-fixed tw-bg-iron-950 tw-z-40 tw-left-0 tw-inset-y-0 tw-border-r tw-border-solid tw-border-iron-700 tw-overflow-y-auto no-scrollbar tw-transform tw-transition-transform tw-duration-300 tw-ease-out ${
            !isSidebarOpen ? "-tw-translate-x-full" : ""
          } tw-w-80`}
          style={{
            top: "var(--header-height, 0px)",
            height: "calc(100vh - var(--header-height, 0px))",
          }}
        >
          <div className="tw-bg-iron-950 tw-w-80 tw-h-full tw-relative">
            <GroupsSidebar />
          </div>
        </div>

        <div
          className={`tw-fixed tw-z-50 tw-transition-all tw-duration-300 tw-ease-out ${
            isSidebarOpen ? "tw-translate-x-80" : "tw-translate-x-0"
          }`}
          style={{
            top: "calc(var(--header-height, 0px) + 0.5rem)",
          }}
        >
          <GroupsSidebarToggleButton
            ref={toggleButtonRef}
            open={isSidebarOpen}
            setOpen={setIsSidebarOpen}
          />
        </div>

        <div className="tailwind-scope tw-bg-iron-950 tw-min-h-screen tw-mt-6 lg:tw-mt-8 tw-pb-16 lg:tw-pb-20 tw-px-6 min-[992px]:tw-px-3 min-[992px]:tw-max-w-[960px] max-[1100px]:tw-max-w-[950px] min-[1200px]:tw-max-w-[1050px] min-[1300px]:tw-max-w-[1150px] min-[1400px]:tw-max-w-[1250px] min-[1500px]:tw-max-w-[1280px] tw-mx-auto">
          <div className="tw-flex">
            <div className="tw-w-full">
              <div
                className={`tw-transform tw-transition-all tw-duration-300 tw-ease-out ${
                  shouldAnimateContentMargin ? "tw-ml-[320px]" : "tw-ml-0"
                }`}
              >
                {isInitialized && children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
