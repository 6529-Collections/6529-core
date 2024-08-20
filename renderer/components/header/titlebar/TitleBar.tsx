import styles from "./TitleBar.module.scss";
import {
  faAnglesUp,
  faArrowLeft,
  faArrowRight,
  faInfo,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import ConfirmClose from "../../confirm/ConfirmClose";
import { useRouter } from "next/router";
import { Button, Modal } from "react-bootstrap";
import TooltipButton from "./TooltipButton";

function isMac() {
  return /Mac/i.test(navigator.userAgent);
}

export default function TitleBar() {
  const router = useRouter();

  const [showConfirm, setShowConfirm] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [navigationLoading, setNavigationLoading] = useState(false);

  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleStart = () => setNavigationLoading(true);
    const handleComplete = () => setNavigationLoading(false);

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleComplete);
    router.events.on("routeChangeError", handleComplete);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleComplete);
      router.events.off("routeChangeError", handleComplete);
    };
  }, [router]);

  useEffect(() => {
    const updateNavState = () => {
      window.api.getNavigationState().then(({ canGoBack, canGoForward }) => {
        setCanGoBack(canGoBack);
        setCanGoForward(canGoForward);
      });
    };

    window.api.onNavigationStateChange(updateNavState);
    updateNavState();

    return () => {
      window.api.removeNavigationStateChangeListener(updateNavState);
    };
  }, []);

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
      window.location.reload();
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

  return (
    <>
      <div className={styles.spacer}></div>
      <span className={styles.buttonWrapper}>
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
      <TooltipButton
        buttonStyles={`${styles.info} ${
          isMac() ? styles.infoMac : styles.infoWin
        }`}
        placement="left"
        onClick={() => setShowInfo(true)}
        icon={faInfo}
        content="Info"
      />
      <ConfirmClose
        onQuit={handleQuit}
        onCancel={handleCancelClose}
        onRunBackground={handleRunBackground}
        show={showConfirm}
      />
      <InfoModal show={showInfo} onHide={() => setShowInfo(false)} />
    </>
  );
}

interface InfoProps {
  show: boolean;
  onHide: () => void;
}

const InfoModal: React.FC<InfoProps> = ({ show, onHide }) => {
  const [info, setInfo] = useState<any>({});

  const handleCheckUpdates = () => {
    window.api.checkUpdates();
    onHide();
  };

  useEffect(() => {
    window.api.getInfo().then((newInfo) => {
      setInfo(newInfo);
    });
  }, []);

  function printInfo(key: string, value: string) {
    return (
      <div className="d-flex flex-column pb-3">
        <span className="font-smaller font-lighter">{key}</span>
        <span>{value}</span>
      </div>
    );
  }

  return (
    <Modal show={show} onHide={onHide} backdrop keyboard={false} centered>
      <Modal.Header>
        <Modal.Title>App Info</Modal.Title>
      </Modal.Header>
      <hr className="mt-0 mb-0" />
      <Modal.Body>
        {printInfo("APP VERSION", info.app_version)}
        {printInfo("APP PORT", `${info.scheme}:${info.port}`)}
        {printInfo("ELECTRON VERSION", info.electron_version)}
        {printInfo("CHROME VERSION", info.chrome_version)}
        {printInfo("NODE VERSION", info.node_version)}
        {printInfo("OS", `${info.os}:${info.arch}`)}
        <div className="text-center">
          <Button
            variant="primary"
            onClick={() => handleCheckUpdates()}
            className="btn-block pt-2 pb-2">
            Check for Updates
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
};
