"use client";

import {
  ConfirmModalShell,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmInputClass,
} from "@/components/shared/ConfirmModalShell";
import { areEqualAddresses } from "@/helpers/Helpers";
import { decryptData } from "@/shared/encrypt";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { createSeedWallet, importSeedWallet } from "../../../electron";

export const SEED_MIN_PASS_LENGTH = 6;

export function CreateSeedWalletModal(
  props: Readonly<{
    show: boolean;
    import?: {
      address: string;
      mnemonic: string;
      privateKey: string;
    };
    onHide: (refresh: boolean) => void;
  }>
) {
  const { showToast } = useToast();
  const [walletName, setWalletName] = useState("");
  const [walletPass, setWalletPass] = useState("");
  const [passHidden, setPassHidden] = useState(true);
  const [error, setError] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showError = (message: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setError(message);
    timeoutRef.current = setTimeout(() => {
      setError("");
      timeoutRef.current = null;
    }, 5000);
  };

  const handleHide = (refresh: boolean) => {
    setWalletName("");
    setWalletPass("");
    setError("");
    props.onHide(refresh);
  };

  const handleCreate = useCallback(async () => {
    if (walletPass.length < SEED_MIN_PASS_LENGTH) {
      showError(`Password must be at least ${SEED_MIN_PASS_LENGTH} characters long`);
      return;
    }
    setError("");
    const data = await createSeedWallet(walletName, walletPass);
    if (data.error) {
      showToast(`Error creating wallet - ${data.data}`, "error");
    } else {
      showToast(
        `Wallet '${walletName}' created successfully - Download Recovery File immediately!`,
        "success"
      );
      handleHide(true);
    }
  }, [walletName, walletPass, showToast]);

  const handleImport = useCallback(async () => {
    if (!props.import) return;
    if (walletPass.length < SEED_MIN_PASS_LENGTH) {
      showError(`Password must be at least ${SEED_MIN_PASS_LENGTH} characters long`);
      return;
    }
    setError("");
    const data = await importSeedWallet(
      walletName,
      walletPass,
      props.import.address,
      props.import.mnemonic,
      props.import.privateKey
    );
    if (data.error) {
      showToast(`Error importing wallet - ${data.data}`, "error");
    } else {
      showToast("Wallet imported successfully!", "success");
      handleHide(true);
    }
  }, [walletName, walletPass, props.import, showToast]);

  return (
    <ConfirmModalShell
      show={props.show}
      title={`${props.import ? "Import" : "Create New"} Wallet`}
      onBackdropClick={() => handleHide(false)}
      footer={
        <>
          <button
            type="button"
            onClick={() => handleHide(false)}
            className={confirmBtnSecondary}
          >
            Cancel
          </button>
          {props.import ? (
            <button
              type="button"
              disabled={!walletName || !walletPass}
              onClick={handleImport}
              className={confirmBtnPrimary}
            >
              Import
            </button>
          ) : (
            <button
              type="button"
              disabled={!walletName || !walletPass}
              onClick={handleCreate}
              className={confirmBtnPrimary}
            >
              Create
            </button>
          )}
        </>
      }
    >
      <label className="tw-block tw-pb-1">Wallet Name</label>
      <input
        autoFocus
        type="text"
        placeholder="My Wallet..."
        value={walletName}
        className={confirmInputClass}
        onChange={(e) => {
          const value = e.target.value;
          if (/^[a-zA-Z0-9 ]*$/.test(value)) setWalletName(value);
          else showError("Name can only contain alphanumeric characters and spaces");
        }}
      />
      <label className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pt-3 tw-pb-1">
        <span>Wallet Password</span>
        <FontAwesomeIcon
          icon={passHidden ? faEyeSlash : faEye}
          height={18}
          onClick={() => setPassHidden(!passHidden)}
          className="tw-cursor-pointer"
        />
      </label>
      <input
        type={passHidden ? "password" : "text"}
        placeholder="******"
        value={walletPass}
        className={confirmInputClass}
        onChange={(e) => {
          const value = e.target.value;
          if (/^\S*$/.test(value)) setWalletPass(value);
          else showError("Password must not contain any whitespace characters");
        }}
      />
      <p className="tw-mt-4 tw-mb-1">
        {error ? (
          <span className="tw-text-red-400">{error}</span>
        ) : (
          <>Provide a name and password for your new wallet</>
        )}
      </p>
    </ConfirmModalShell>
  );
}

export function UnlockSeedWalletModal(
  props: Readonly<{
    show: boolean;
    address: string;
    address_hashed: string;
    onUnlock: (pass: string) => void;
    onHide: () => void;
  }>
) {
  const [walletPass, setWalletPass] = useState("");
  const [passHidden, setPassHidden] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showError = (message: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setError(message);
    timeoutRef.current = setTimeout(() => {
      setError("");
      timeoutRef.current = null;
    }, 5000);
  };

  const handleHide = () => {
    setWalletPass("");
    setError("");
    setUnlocking(false);
    props.onHide();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && walletPass) handleUnlock();
  };

  const showUnlockError = () => {
    setUnlocking(false);
    showError("Failed to unlock wallet");
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleUnlock = useCallback(async () => {
    setError("");
    setUnlocking(true);
    const doUnlock = async () => {
      try {
        const decryptedAddress = await decryptData(
          props.address,
          props.address_hashed,
          walletPass
        );
        if (areEqualAddresses(props.address, decryptedAddress)) {
          props.onUnlock(walletPass);
          handleHide();
        } else {
          showUnlockError();
        }
      } catch {
        showUnlockError();
      }
    };
    setTimeout(doUnlock, 0);
  }, [walletPass, props]);

  return (
    <ConfirmModalShell
      show={props.show}
      title="Unlock Wallet"
      onBackdropClick={handleHide}
      footer={
        <>
          <button type="button" onClick={handleHide} className={confirmBtnSecondary}>
            Cancel
          </button>
          <button
            type="button"
            disabled={
              unlocking ||
              !walletPass ||
              walletPass.length < SEED_MIN_PASS_LENGTH
            }
            onClick={handleUnlock}
            className={confirmBtnPrimary}
          >
            {unlocking ? "Unlocking..." : "Unlock"}
          </button>
        </>
      }
    >
      <label className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pt-3 tw-pb-1">
        <span>Wallet Password</span>
        <FontAwesomeIcon
          icon={passHidden ? faEyeSlash : faEye}
          height={18}
          onClick={() => setPassHidden(!passHidden)}
          className="tw-cursor-pointer"
        />
      </label>
      <input
        ref={inputRef}
        autoFocus
        type={passHidden ? "password" : "text"}
        placeholder="******"
        value={walletPass}
        className={confirmInputClass}
        onChange={(e) => {
          const value = e.target.value;
          if (/^\S*$/.test(value)) setWalletPass(value);
          else showError("Password must not contain any whitespace characters");
        }}
        onKeyDown={handleKeyPress}
      />
      <p className="tw-mt-4 tw-mb-1">
        {error ? (
          <span className="tw-text-red-400">{error}</span>
        ) : (
          <>Provide wallet password to continue</>
        )}
      </p>
    </ConfirmModalShell>
  );
}
