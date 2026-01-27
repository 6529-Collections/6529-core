"use client";

import {
  ConfirmModalShell,
  confirmBtnDanger,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmInputClass,
  confirmModalFooterBetween,
} from "@/components/shared/ConfirmModalShell";
import { useModalState } from "@/contexts/ModalStateContext";
import { useToast } from "@/contexts/ToastContext";
import { SeedWalletRequest } from "@/shared/types";
import {
  faCheckCircle,
  faEye,
  faEyeSlash,
  faLock,
  faLockOpen,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";
import { SEED_MIN_PASS_LENGTH } from "../core/core-wallet/SeedWalletModal";

const SEED_WALLET_LOCK_MODAL = "ConfirmSeedWalletLockModal";

export default function ConfirmSeedWalletLock(
  props: Readonly<{
    name: string;
    address: string;
    show: boolean;
    unlockedWallet?: ethers.Wallet | undefined;
    pendingRequest?: SeedWalletRequest | undefined;
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
  const { isTopModal, addModal, removeModal } = useModalState();

  useEffect(() => {
    if (!props.show) {
      setWalletPass("");
      setPassHidden(true);
      setUnlocking(false);
    }
  }, [props.show]);

  useEffect(() => {
    if (props.show) addModal(SEED_WALLET_LOCK_MODAL);
    else removeModal(SEED_WALLET_LOCK_MODAL);
    return () => removeModal(SEED_WALLET_LOCK_MODAL);
  }, [props.show, addModal, removeModal]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
    [props, showToast]
  );

  return (
    <ConfirmModalShell
      show={props.show}
      title={
        <>
          <FontAwesomeIcon
            icon={props.unlockedWallet ? faLockOpen : faLock}
            height={22}
          />
          {props.name}
        </>
      }
      titleClassName="tw-m-0 tw-flex tw-items-center tw-gap-3 tw-text-lg tw-font-semibold"
      footerClassName={confirmModalFooterBetween}
      dialogClassName={
        !isTopModal(SEED_WALLET_LOCK_MODAL) ? "tw-blur-[5px]" : ""
      }
      footer={
        <>
          <span>
            {props.pendingRequest && (
              <span className="tw-font-light tw-text-iron-400">
                pending:{" "}
                <code className="tw-rounded tw-bg-iron-800 tw-px-1 tw-py-0.5">
                  {props.pendingRequest.method}
                </code>
              </span>
            )}
          </span>
          <span className="tw-flex tw-gap-2">
            <button
              type="button"
              onClick={props.onHide}
              className={confirmBtnSecondary}
            >
              Close
            </button>
            {props.unlockedWallet ? (
              <button
                type="button"
                onClick={handleLock}
                className={confirmBtnDanger}
              >
                Lock
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  !walletPass ||
                  walletPass.length < SEED_MIN_PASS_LENGTH ||
                  unlocking
                }
                onClick={() => handleUnlock(walletPass)}
                className={confirmBtnPrimary}
              >
                {unlocking ? "Unlocking..." : "Unlock"}
              </button>
            )}
          </span>
        </>
      }
    >
      <div className="tw-pb-3 tw-text-sm tw-text-iron-400">
        Address: {props.address}
      </div>
      {props.unlockedWallet ? (
        <div className="tw-flex tw-items-center tw-gap-2">
          <FontAwesomeIcon
            icon={faCheckCircle}
            className="tw-text-[#00ff00]"
            height={18}
          />
          <span>Your wallet is unlocked</span>
        </div>
      ) : (
        <>
          <label className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pb-1">
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
            onChange={(e) => setWalletPass(e.target.value)}
            onKeyDown={handleKeyPress}
          />
        </>
      )}
    </ConfirmModalShell>
  );
}
