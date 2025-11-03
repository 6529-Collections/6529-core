"use client";

import ConfirmClose from "@/components/confirm/ConfirmClose";
import { publicEnv } from "@/config/env";
import { useGlobalRefresh } from "@/contexts/RefreshContext";
import { useSearch } from "@/contexts/SearchContext";
import {
  faAnglesUp,
  faArrowLeft,
  faArrowRight,
  faCheck,
  faInfo,
  faLink,
  faRefresh,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import Cookies from "js-cookie";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "react-bootstrap";
import styles from "./TitleBar.module.scss";
import TooltipButton from "./TooltipButton";

function isMac() {
  return /Mac/i.test(navigator.userAgent);
}

const DISABLE_UPDATE_MODAL_COOKIE = "disable_update_modal";

export default function TitleBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isOpen, open, close } = useSearch();
  const { globalRefresh } = useGlobalRefresh();

  const prevPathnameRef = useRef(pathname);
  const prevSearchParamsRef = useRef(searchParams?.toString() || "");

  const [showConfirm, setShowConfirm] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<{
    version: string;
  }>();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [version, setVersion] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    window.api.getInfo().then((newInfo) => {
      if (newInfo.app_version) {
        setVersion(`v${newInfo.app_version}`);
      }
      window.updater.checkUpdates();
    });
  }, []);

  useEffect(() => {
    const updateNavState = () => {
      window.api.getNavigationState().then(({ canGoBack, canGoForward }) => {
        setCanGoBack(canGoBack);
        setCanGoForward(canGoForward);
        setNavigationLoading(false);
      });
    };

    const handleUpdateAvailable = (_event: any, info: any) => {
      setUpdateAvailable(info);
      const disableUpdateModal = Cookies.get(DISABLE_UPDATE_MODAL_COOKIE);
      if (!disableUpdateModal) {
        setShowUpdateModal(true);
        Cookies.set(DISABLE_UPDATE_MODAL_COOKIE, "true", { expires: 1 });
      }
    };

    window.api.onNavigationStateChange(updateNavState);
    updateNavState();

    const handleNavigate = (_event: any, url: string) => {
      console.log("Navigating to:", url);
      setNavigationLoading(true);
      const normalizedUrl = url.split("?")[0];
      const normalizedPathname = pathname.split("?")[0];

      if (normalizedPathname !== normalizedUrl) {
        router.push(url);
      } else {
        const currentParams = new URLSearchParams(window.location.search);
        currentParams.set("reload", "true");
        const reloadUrl = `${normalizedUrl}?${currentParams.toString()}`;
        router.replace(reloadUrl, { scroll: false });
      }
    };
    window.api.onNavigate(handleNavigate);

    window.updater.onUpdateAvailable(handleUpdateAvailable);

    return () => {
      window.api.offNavigationStateChange(updateNavState);
      window.api.offNavigate(handleNavigate);
      window.updater.offUpdateAvailable(handleUpdateAvailable);
    };
  }, [pathname, router]);

  useEffect(() => {
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest("a");

      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href === "#") return;

      if (link.target === "_blank" || link.hasAttribute("download")) return;

      try {
        const url =
          href.startsWith("/") || href.startsWith("?")
            ? new URL(href, window.location.origin)
            : new URL(href);

        const currentUrl = new URL(window.location.href);

        const isExternal = url.origin !== currentUrl.origin;
        if (isExternal) return;

        const willNavigate =
          url.pathname !== currentUrl.pathname ||
          url.search !== currentUrl.search;

        if (willNavigate) {
          setNavigationLoading(true);
        }
      } catch {
        const willNavigate = href.startsWith("/") && href !== pathname;

        if (willNavigate) {
          setNavigationLoading(true);
        }
      }
    };

    document.addEventListener("click", handleLinkClick, true);

    return () => {
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [pathname]);

  useEffect(() => {
    const currentUrl = window.location.pathname + window.location.search;
    const currentPathname = pathname;
    const currentSearchParams = searchParams?.toString() || "";
    const expectedUrl =
      currentPathname + (currentSearchParams ? `?${currentSearchParams}` : "");

    const prevPathname = prevPathnameRef.current;
    const prevSearchParams = prevSearchParamsRef.current;
    const pathnameChanged = currentPathname !== prevPathname;
    const searchParamsChanged = currentSearchParams !== prevSearchParams;

    if (currentUrl !== expectedUrl) {
      setNavigationLoading(true);
      const timeoutId = setTimeout(() => {
        setNavigationLoading(false);
      }, 5000);
      return () => clearTimeout(timeoutId);
    } else if (pathnameChanged || searchParamsChanged) {
      if (pathnameChanged) {
        prevPathnameRef.current = currentPathname;
      }
      if (searchParamsChanged) {
        prevSearchParamsRef.current = currentSearchParams;
      }

      let frame1Id: number;
      let frame2Id: number;
      
      frame1Id = requestAnimationFrame(() => {
        frame2Id = requestAnimationFrame(() => {
          setNavigationLoading(false);
        });
      });

      const timeoutId = setTimeout(() => {
        if (frame1Id) cancelAnimationFrame(frame1Id);
        if (frame2Id) cancelAnimationFrame(frame2Id);
        setNavigationLoading(false);
      }, 2000);

      return () => {
        if (frame1Id) cancelAnimationFrame(frame1Id);
        if (frame2Id) cancelAnimationFrame(frame2Id);
        clearTimeout(timeoutId);
      };
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    const handlePopState = () => {
      setNavigationLoading(true);
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      setNavigationLoading(true);
      return originalPushState.apply(history, args);
    };

    history.replaceState = function (...args) {
      setNavigationLoading(true);
      return originalReplaceState.apply(history, args);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const handleOpenSearch = () => {
    if (navigationLoading) return;
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  const handleBack = () => {
    if (navigationLoading || !canGoBack) return;
    setNavigationLoading(true);
    window.api.goBack();
  };

  const handleForward = () => {
    if (navigationLoading || !canGoForward) return;
    setNavigationLoading(true);
    window.api.goForward();
  };

  const handleRefresh = () => {
    if (navigationLoading) return;
    setNavigationLoading(true);
    globalRefresh();
  };

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 600) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleScrollTop = () => {
    if (navigationLoading) return;
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    window.api.onAppClose(() => {
      setShowConfirm(true);
    });
  }, []);

  const handleRunBackground = () => {
    window.api.runBackground();
    setShowConfirm(false);
  };

  const handleQuit = () => {
    window.api.quit();
    setShowConfirm(false);
  };

  const handleCancelClose = () => {
    setShowConfirm(false);
  };

  const getLinkPath = () => {
    let path = window.location.pathname;
    if (path.startsWith("/")) {
      path = path.slice(1);
    }
    return path;
  };

  const getQueryParams = () => {
    const queryParams = new URLSearchParams(window.location.search);
    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : "";
  };

  const copyCurrentUrl = () => {
    const link = `${
      publicEnv.BASE_ENDPOINT
    }/${getLinkPath()}${getQueryParams()}`;
    navigator.clipboard.writeText(link).then(() => {
      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, 1000);
    });
  };

  return (
    <>
      <div className={styles.spacer}></div>
      <span className={styles.buttonWrapper}>
        <TooltipButton
          buttonStyles={`${styles.button} ${
            navigationLoading ? styles.disabled : styles.enabled
          }`}
          onClick={handleOpenSearch}
          icon={faSearch}
          content="Search"
        />
        <TooltipButton
          buttonStyles={`${styles.button} ${
            canGoBack && !navigationLoading ? styles.enabled : styles.disabled
          }`}
          onClick={handleBack}
          icon={faArrowLeft}
          content="Go Back"
        />
        <TooltipButton
          buttonStyles={`${styles.button} ${
            canGoForward && !navigationLoading
              ? styles.enabled
              : styles.disabled
          }`}
          onClick={handleForward}
          icon={faArrowRight}
          content="Go Forward"
        />
        {isCopied ? (
          <TooltipButton
            buttonStyles={`${styles.button} ${styles.buttonCopied}`}
            icon={faCheck}
            content="Copied"
            onClick={() => setIsCopied(false)}
            hideOnClick={false}
          />
        ) : (
          <TooltipButton
            buttonStyles={`${styles.button} ${
              navigationLoading ? styles.disabled : styles.enabled
            }`}
            onClick={copyCurrentUrl}
            icon={faLink}
            content="Copy Current URL"
            hideOnClick={false}
          />
        )}
        <TooltipButton
          buttonStyles={`${styles.button} ${
            navigationLoading ? styles.disabled : styles.enabled
          }`}
          onClick={handleRefresh}
          icon={faRefresh}
          iconStyles={navigationLoading ? styles.refreshSpin : ""}
          content="Refresh"
        />
        {showScrollTop && (
          <TooltipButton
            buttonStyles={`${styles.button} ${
              navigationLoading ? styles.disabled : styles.enabled
            }`}
            onClick={handleScrollTop}
            icon={faAnglesUp}
            content="Scroll to top"
          />
        )}
      </span>
      <span
        className={`${styles.version} ${
          isMac()
            ? updateAvailable
              ? styles.versionMacUpdate
              : styles.versionMac
            : updateAvailable
            ? styles.versionWinUpdate
            : styles.versionWin
        }`}>
        {version}
      </span>
      <TooltipButton
        buttonStyles={`${styles.info} ${
          isMac() ? styles.infoMac : styles.infoWin
        } ${navigationLoading ? styles.disabled : ""}`}
        placement="left"
        onClick={() => !navigationLoading && router.push("/core/core-info")}
        icon={faInfo}
        content="App Info"
        buttonContent={updateAvailable ? "Update Available" : ""}
      />
      <ConfirmClose
        onQuit={handleQuit}
        onCancel={handleCancelClose}
        onRunBackground={handleRunBackground}
        show={showConfirm}
      />
      <Modal
        show={showUpdateModal}
        onHide={() => setShowUpdateModal(false)}
        backdrop
        keyboard={false}
        centered>
        <div className={styles.updateModalHeader}>
          <Modal.Title>Update Available</Modal.Title>
        </div>
        <Modal.Body className={styles.updateModalContent}>
          <p>Version {updateAvailable?.version} is available.</p>
          <span>
            Visit{" "}
            <Link
              href={"/core/core-info"}
              onClick={() => setShowUpdateModal(false)}>
              App Info
            </Link>{" "}
            page to update.
          </span>
        </Modal.Body>
        <Modal.Footer className={styles.updateModalContent}>
          <Button variant="secondary" onClick={() => setShowUpdateModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
