"use client";

import ConfirmClose from "@/components/confirm/ConfirmClose";
import { useGlobalRefresh } from "@/contexts/RefreshContext";
import { useSearch } from "@/contexts/SearchContext";
import { SEIZE_URL } from "@/electron-constants";
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
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  const { isOpen, open, close } = useSearch();
  const { globalRefresh } = useGlobalRefresh();

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
      if (pathname !== url) {
        router.push(url);
      } else {
        const reloadUrl = url.includes("?")
          ? `${url}&reload=true`
          : `${url}?reload=true`;
        router.push(reloadUrl);
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

  const handleOpenSearch = () => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  const handleBack = () => {
    if (canGoBack) {
      setNavigationLoading(true);
      window.api.goBack();
    }
  };

  const handleForward = () => {
    if (canGoForward) {
      setNavigationLoading(true);
      window.api.goForward();
    }
  };

  const handleRefresh = () => {
    if (!navigationLoading) {
      setNavigationLoading(true);
      globalRefresh();
    }
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
    const link = `${SEIZE_URL}/${getLinkPath()}${getQueryParams()}`;
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
            canGoBack ? styles.enabled : styles.disabled
          }`}
          onClick={handleBack}
          icon={faArrowLeft}
          content="Go Back"
        />
        <TooltipButton
          buttonStyles={`${styles.button} ${
            canGoForward ? styles.enabled : styles.disabled
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
            buttonStyles={`${styles.button} ${styles.enabled}`}
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
        }`}
        placement="left"
        onClick={() => router.push("/core/core-info")}
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
