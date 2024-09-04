import Cookies from "js-cookie";
import router from "next/router";
import { useEffect, useState } from "react";
import styles from "./Confirm.module.scss";
import { Modal, Button } from "react-bootstrap";
import { SeedWalletRequest } from "../../../shared/types";
import { hexToString } from "../../helpers";
import { isValidEthAddress } from "../../helpers/Helpers";

export default function ConfirmSeedWalletRequest() {
  const [show, setShow] = useState(false);

  const [seedRequest, setSeedRequest] = useState<SeedWalletRequest>();

  const clear = () => {
    setSeedRequest(undefined);
    setShow(false);
  };

  const onCancel = (request: SeedWalletRequest) => {
    window.seedConnector.cancel(request);
    clear();
  };

  const onConfirm = (request: SeedWalletRequest) => {
    window.seedConnector.confirm(request);
    clear();
  };

  useEffect(() => {
    const handleRequest = (_event: any, request: SeedWalletRequest) => {
      console.log("handling request", request);
      setSeedRequest(request);
      setShow(true);
    };

    window.seedConnector.onInitRequest(handleRequest);

    return () => {
      window.seedConnector.offInitRequest(handleRequest);
    };
  }, []);

  function getHtml(index: number, param: string) {
    let content = "";
    if (isValidEthAddress(param)) {
      content = param;
    } else {
      const parsed = hexToString(param).replace(/^\n+/, "");
      content = parsed.replaceAll("\n", "<br>");
    }

    return `${index + 1}. ${content}`;
  }

  if (!seedRequest) {
    return <></>;
  }

  return (
    <Modal
      show={show}
      onHide={() => onCancel(seedRequest)}
      backdrop
      keyboard={false}
      centered>
      <Modal.Header className={styles.modalHeader}>
        <Modal.Title>Confirm Seed Wallet Request</Modal.Title>
      </Modal.Header>
      <Modal.Body
        className={`${styles.modalContent} ${styles.modalContentSeedRequest}`}>
        <div className="mt-2 mb-2">
          <span className="d-flex flex-column">
            <span>Method</span>
            <code>{seedRequest?.method}</code>
          </span>
          <span className="pt-3 d-flex flex-column">
            <span>Parameters</span>
            {seedRequest?.params?.map((param, index) => (
              <code
                key={index}
                className="pt-3 pb-3"
                dangerouslySetInnerHTML={{
                  __html: getHtml(index, param),
                }}></code>
            ))}
          </span>
        </div>
      </Modal.Body>
      <Modal.Footer className={styles.modalContent}>
        <Button variant="secondary" onClick={() => onCancel(seedRequest)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onConfirm(seedRequest)}>
          Confirm
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
