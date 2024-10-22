import styles from "./WorkersHub.module.scss";
import { useCallback, useRef, useState } from "react";
import { Modal, Button } from "react-bootstrap";
import { addRpcProvider } from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";
import Link from "next/link";
import { ethers } from "ethers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Spinner } from "../../dotLoader/DotLoader";

export function AddRpcProviderModal(
  props: Readonly<{
    show: boolean;
    onHide: (refresh: boolean) => void;
  }>
) {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [urlValidation, setUrlValidation] = useState(false);

  const [testingUrl, setTestingUrl] = useState(false);
  const [addingRpcProvider, setAddingRpcProvider] = useState(false);

  const showError = (message: string) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setError(message);

    timeoutRef.current = setTimeout(() => {
      setError("");
      timeoutRef.current = null;
    }, 5000);
  };

  const reset = () => {
    setName("");
    setUrl("");
    setError("");
    setUrlValidation(false);
    setTestingUrl(false);

    urlInputRef.current?.focus();
  };

  const handleHide = (refresh: boolean) => {
    reset();
    props.onHide(refresh);
  };

  const handleAdd = useCallback(async () => {
    try {
      const data = await addRpcProvider(name, url);

      if (data.error) {
        showToast(`Error creating RPC provider - ${data.data}`, "error");
      } else {
        showToast(`RPC provider '${name}' created successfully`, "success");
        handleHide(true);
      }
    } finally {
      setAddingRpcProvider(false);
    }
  }, [name, url]);

  const testRpcProvider = useCallback(async () => {
    try {
      setUrlValidation(false);
      const provider = new ethers.JsonRpcProvider(url);
      const block = await provider.getBlockNumber();
      if (!block || isNaN(block)) {
        throw new Error();
      }
      await provider.getLogs({
        fromBlock: block,
        toBlock: block,
      });
      setUrl(url.replace(/\/+$/, ""));
      setUrlValidation(true);
      nameInputRef.current?.focus();
    } catch (error) {
      showError("Invalid RPC URL");
      urlInputRef.current?.select();
    } finally {
      setTestingUrl(false);
    }
  }, [url]);

  return (
    <Modal
      show={props.show}
      onHide={() => handleHide(false)}
      backdrop
      keyboard={false}
      centered>
      <Modal.Header className={styles.modalHeader}>
        <Modal.Title>Add RPC Provider</Modal.Title>
      </Modal.Header>
      <Modal.Body className={styles.modalContent}>
        <div className="font-smaller">
          RPC URLs Directory:{" "}
          <Link
            href="https://ethereumnodes.com/"
            target="_blank"
            rel="noreferrer">
            https://ethereumnodes.com/
          </Link>
        </div>
        <div className="mt-3">
          <label className="pb-1">RPC URL</label>
          <input
            ref={urlInputRef}
            disabled={urlValidation}
            autoFocus
            type="text"
            placeholder="https://..."
            value={url}
            className={styles.modalInput}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
          />
        </div>
        <div className="text-right mt-2">
          <Button
            variant="primary"
            disabled={!url || urlValidation || testingUrl}
            onClick={() => {
              testRpcProvider();
              setTestingUrl(true);
            }}>
            <span className="d-flex align-items-center gap-1">
              {urlValidation ? (
                <>
                  <FontAwesomeIcon
                    icon={faCheckCircle}
                    color="white"
                    height={16}
                  />
                  <span>Valid</span>
                </>
              ) : (
                <>
                  {testingUrl && <Spinner dimension={16} />}
                  <span>{testingUrl ? "Testing..." : "Test"}</span>
                </>
              )}
            </span>
          </Button>
        </div>
        <div className="mt-1">
          <label className="pb-1">Provider Name</label>
          <input
            ref={nameInputRef}
            disabled={!urlValidation}
            type="text"
            placeholder="My RPC Provider..."
            value={name}
            className={styles.modalInput}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </div>
        <p className="mt-4 mb-1">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : urlValidation ? (
            <>Provide a name for your new RPC provider</>
          ) : (
            <>Provide a URL for your new RPC provider and test it</>
          )}
        </p>
      </Modal.Body>
      <Modal.Footer
        className={`d-flex justify-content-between ${styles.modalContent}`}>
        <Button variant="danger" onClick={() => reset()}>
          Reset
        </Button>
        <span className="d-flex gap-2">
          <Button variant="secondary" onClick={() => handleHide(false)}>
            Cancel
          </Button>
          <Button
            variant="success"
            disabled={!name || !url || addingRpcProvider}
            onClick={() => {
              setAddingRpcProvider(true);
              handleAdd();
            }}>
            {addingRpcProvider ? <Spinner dimension={16} /> : "Add"}
          </Button>
        </span>
      </Modal.Footer>
    </Modal>
  );
}
