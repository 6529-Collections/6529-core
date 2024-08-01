import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import styles from "./TitleBar.module.scss";
import {
  faArrowLeft,
  faArrowRight,
  faInfo,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import ConfirmClose from "../../confirm/ConfirmClose";
import { useRouter } from "next/router";
import { Modal } from "react-bootstrap";
import Tippy from "@tippyjs/react";

export default function TitleBar() {
  const router = useRouter();

  const [showConfirm, setShowConfirm] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [navigationLoading, setNavigationLoading] = useState(false);

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
      <span className={styles.buttonWrapper}>
        <Tippy
          className={styles.tippy}
          delay={250}
          content="Go Back"
          placement="right"
          theme="light">
          <button
            className={`${styles.button} ${
              canGoBack ? styles.enabled : styles.disabled
            }`}
            onClick={handleBack}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
        </Tippy>
        <Tippy
          className={styles.tippy}
          delay={250}
          content="Go Forward"
          placement="right"
          theme="light">
          <button
            className={`${styles.button} ${
              canGoForward ? styles.enabled : styles.disabled
            }`}
            onClick={handleForward}>
            <FontAwesomeIcon icon={faArrowRight} />
          </button>
        </Tippy>
        <Tippy
          className={styles.tippy}
          delay={250}
          content="Refresh"
          placement="right"
          theme="light">
          <button
            className={`${styles.button} ${
              !navigationLoading ? styles.enabled : styles.disabled
            }`}
            onClick={handleRefresh}>
            <FontAwesomeIcon
              icon={faRefresh}
              className={navigationLoading ? styles.refreshSpin : ""}
            />
          </button>
        </Tippy>
      </span>

      <Tippy
        className={styles.tippy}
        delay={250}
        content="Info"
        placement="left"
        theme="light">
        <button
          className={`${styles.button} ${styles.info}`}
          onClick={() => setShowInfo(true)}>
          <FontAwesomeIcon icon={faInfo} />
        </button>
      </Tippy>
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
        {printInfo("APP PORT", `:${info.port}`)}
        {printInfo("ELECTRON VERSION", info.electron_version)}
        {printInfo("CHROME VERSION", info.chrome_version)}
        {printInfo("NODE VERSION", info.node_version)}
        {printInfo("OS", `${info.os}:${info.arch}`)}
      </Modal.Body>
    </Modal>
  );
};
