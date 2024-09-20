import styles from "./Confirm.module.scss";
import { Modal, Button } from "react-bootstrap";
import { ethers } from "ethers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
} from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_MIN_PASS_LENGTH } from "../network/seedWallet/SeedWalletModal";
import { SeedWalletRequest } from "../../../shared/types";
import { useToast } from "../../contexts/ToastContext";
import { on } from "events";
import { useModalState } from "../../contexts/ModalStateContext";

const SEED_WALLET_LOCK_MODAL = "ConfirmSeedWalletLockModal";

export default function ConfirmSeedWalletLock(
  props: Readonly<{
    name: string;
    show: boolean;
    unlockedWallet?: ethers.Wallet;
    pendingRequest?: SeedWalletRequest;
    onHide: () => void;
    onUnlock: (password: string) => Promise<boolean>;
    onLock: () => void;
  }>
) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [unlocking, setUnlocking] = useState(false);
  const [walletPass, setWalletPass] = useState("");
  const [passHidden, setPassHidden] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    if (!props.show) {
      setWalletPass("");
      setPassHidden(true);
      setUnlocking(false);
    }
  }, [props.show]);

  const handleKeyPress = (e: any) => {
    if (
      e.key === "Enter" &&
      walletPass &&
      !unlocking &&
      walletPass.length >= SEED_MIN_PASS_LENGTH
    ) {
      handleUnlock(walletPass);
    }
  };

  const handleLock = () => {
    props.onLock();
    props.onHide();
    showToast("Wallet Locked!", "success", true);
  };

  const handleUnlock = useCallback(
    async (pass: string) => {
      setUnlocking(true);

      const doUnlock = async () => {
        try {
          const isSuccess = await props.onUnlock(pass);
          if (isSuccess) {
            showToast("Wallet Unlocked!", "success", true);
            setWalletPass("");
          } else {
            showToast("Failed to unlock wallet", "error", true);
            inputRef.current?.focus();
            inputRef.current?.select();
          }
        } finally {
          setUnlocking(false);
        }
      };

      setTimeout(doUnlock, 0);
    },
    [unlocking]
  );

  function printLocked() {
    return (
      <>
        <label className="pb-1 d-flex align-items-center justify-content-between">
          <span className="unselectable">Wallet Password</span>
          <FontAwesomeIcon
            icon={passHidden ? faEyeSlash : faEye}
            height={18}
            onClick={() => setPassHidden(!passHidden)}
            style={{
              cursor: "pointer",
            }}
          />
        </label>
        <input
          ref={inputRef}
          autoFocus
          type={passHidden ? "password" : "text"}
          placeholder="******"
          value={walletPass}
          className={styles.seedWalletInput}
          onChange={(e) => setWalletPass(e.target.value)}
          onKeyDown={handleKeyPress}
        />
      </>
    );
  }

  function printUnlocked() {
    return (
      <div className="d-flex align-items-center gap-2">
        <FontAwesomeIcon icon={faCheckCircle} color={"#00ff00"} height={18} />{" "}
        <span>Your wallet is unlocked</span>
      </div>
    );
  }

  const { isTopModal, addModal, removeModal } = useModalState();

  useEffect(() => {
    if (props.show) {
      addModal(SEED_WALLET_LOCK_MODAL);
    } else {
      removeModal(SEED_WALLET_LOCK_MODAL);
    }

    return () => {
      removeModal(SEED_WALLET_LOCK_MODAL);
    };
  }, [props.show]);

  return (
    <Modal
      show={props.show}
      keyboard={false}
      centered
      backdrop="static"
      onHide={props.onHide}
      dialogClassName={
        !isTopModal(SEED_WALLET_LOCK_MODAL) ? "modal-blurred" : ""
      }>
      <Modal.Header className={styles.modalHeader}>
        <Modal.Title className="d-flex align-items-center gap-3">
          <FontAwesomeIcon
            icon={props.unlockedWallet ? faLockOpen : faLock}
            height={22}
          />
          <span>{props.name}</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className={styles.modalContent}>
        {props.unlockedWallet ? printUnlocked() : printLocked()}
      </Modal.Body>
      <Modal.Footer
        className={`${styles.modalContent} d-flex align-items-center justify-content-between`}>
        <span>
          {props.pendingRequest && (
            <span className="font-lighter">
              pending: <code>{props.pendingRequest.method}</code>
            </span>
          )}
        </span>
        <span className="d-flex gap-2">
          <Button variant="secondary" onClick={props.onHide}>
            Close
          </Button>
          {props.unlockedWallet ? (
            <Button variant="danger" onClick={handleLock}>
              Lock
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={
                !walletPass ||
                walletPass.length < SEED_MIN_PASS_LENGTH ||
                unlocking
              }
              onClick={() => handleUnlock(walletPass)}>
              {unlocking ? "Unlocking..." : "Unlock"}
            </Button>
          )}
        </span>
      </Modal.Footer>
    </Modal>
  );
}
