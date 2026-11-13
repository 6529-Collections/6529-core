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
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { SEED_MIN_PASS_LENGTH } from "../core/core-wallet/SeedWalletModal";
import { useOfferWalletPasswordSave } from "@/hooks/useOfferWalletPasswordSave";
import { useSavedWalletPassword } from "@/hooks/useSavedWalletPassword";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";

const SEED_WALLET_LOCK_MODAL = "ConfirmSeedWalletLockModal";

export default function ConfirmSeedWalletLock(
  props: Readonly<{
    name: string;
    address: string;
    show: boolean;
    isUnlocked: boolean;
    pendingRequest?: SeedWalletRequest | undefined;
    onHide: () => void;
    onUnlock: (password?: string) => Promise<boolean>;
    onLock: () => void;
  }>
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const locale = useBrowserLocale();
  const [unlocking, setUnlocking] = useState(false);
  const [walletPass, setWalletPass] = useState("");
  const [passHidden, setPassHidden] = useState(true);
  const { showToast } = useToast();
  const { isTopModal, addModal, removeModal } = useModalState();
  const isCurrentTopModal = isTopModal(SEED_WALLET_LOCK_MODAL);
  const offerSave = useOfferWalletPasswordSave();
  const { hasSavedPassword, clearSavedPassword } = useSavedWalletPassword(
    props.show && isCurrentTopModal && !props.isUnlocked
      ? props.address
      : undefined
  );
  const canUnlock = walletPass
    ? walletPass.length >= SEED_MIN_PASS_LENGTH
    : hasSavedPassword;

  const focusPasswordInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.focus({ preventScroll: true });
    input.select();
  }, []);

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

  useEffect(() => {
    if (!props.show || props.isUnlocked || !isCurrentTopModal) {
      return;
    }

    const animationFrameId =
      globalThis.requestAnimationFrame?.(focusPasswordInput) ?? null;
    const focusTimeout = setTimeout(focusPasswordInput, 75);
    const settledFocusTimeout = setTimeout(focusPasswordInput, 175);

    return () => {
      if (animationFrameId !== null) {
        globalThis.cancelAnimationFrame?.(animationFrameId);
      }
      clearTimeout(focusTimeout);
      clearTimeout(settledFocusTimeout);
    };
  }, [focusPasswordInput, isCurrentTopModal, props.show, props.isUnlocked]);

  const handleLock = () => {
    props.onLock();
    props.onHide();
    showToast(t(locale, "desktop.walletPasswords.locked"), "success", true);
  };

  const handleUnlock = async () => {
    if (unlocking || !canUnlock) return;
    setUnlocking(true);
    try {
      const success = await props.onUnlock(walletPass || undefined);
      if (!success) {
        if (!walletPass) clearSavedPassword();
        const key = walletPass
          ? "desktop.walletPasswords.unlockFailed"
          : "desktop.walletPasswords.manualFallback";
        showToast(t(locale, key), "error", true);
        focusPasswordInput();
        return;
      }
      showToast(t(locale, "desktop.walletPasswords.unlocked"), "success", true);
      setWalletPass("");
      if (walletPass) await offerSave(props.address, walletPass);
    } catch {
      if (!walletPass) clearSavedPassword();
      showToast(t(locale, "desktop.walletPasswords.unlockFailed"), "error", true);
      focusPasswordInput();
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <ConfirmModalShell
      show={props.show}
      title={
        <>
          <FontAwesomeIcon
            icon={props.isUnlocked ? faLockOpen : faLock}
            height={22}
          />
          {props.name}
        </>
      }
      titleClassName="tw-m-0 tw-flex tw-items-center tw-gap-3 tw-text-lg tw-font-semibold"
      footerClassName={confirmModalFooterBetween}
      {...(props.isUnlocked || !isCurrentTopModal
        ? {}
        : {
            initialFocusRef:
              inputRef as unknown as RefObject<HTMLElement | null>,
          })}
      dialogClassName={!isCurrentTopModal ? "tw-blur-[5px]" : ""}
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
              disabled={unlocking}
              onClick={props.onHide}
              className={confirmBtnSecondary}
            >
              {t(locale, "desktop.walletPasswords.close")}
            </button>
            {props.isUnlocked ? (
              <button
                type="button"
                onClick={handleLock}
                className={confirmBtnDanger}
              >
                {t(locale, "desktop.walletPasswords.lock")}
              </button>
            ) : (
              <button
                type="button"
                disabled={unlocking || !canUnlock}
                onClick={handleUnlock}
                className={confirmBtnPrimary}
              >
                {t(
                  locale,
                  unlocking ? "desktop.walletPasswords.unlocking" : "desktop.walletPasswords.unlock"
                )}
              </button>
            )}
          </span>
        </>
      }
    >
      <div className="tw-pb-3 tw-text-sm tw-text-iron-400">
        Address: {props.address}
      </div>
      {props.isUnlocked ? (
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
          <div className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pb-1">
            <label htmlFor="connected-wallet-password">
              {t(locale, "desktop.walletPasswords.walletPassword")}
            </label>
            <button
              type="button"
              onClick={() => setPassHidden(!passHidden)}
              aria-label={t(
                locale,
                passHidden
                  ? "desktop.walletPasswords.showPassword"
                  : "desktop.walletPasswords.hidePassword"
              )}
              className="tw-rounded-lg tw-border-0 tw-bg-transparent tw-p-1 tw-text-inherit focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400"
            >
              <FontAwesomeIcon
                icon={passHidden ? faEyeSlash : faEye}
                height={18}
                aria-hidden="true"
                className="tw-cursor-pointer"
              />
            </button>
          </div>
          <input
            id="connected-wallet-password"
            readOnly={unlocking}
            autoComplete="current-password"
            ref={inputRef}
            autoFocus
            type={passHidden ? "password" : "text"}
            placeholder="******"
            value={walletPass}
            className={confirmInputClass}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(e) => setWalletPass(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleUnlock();
            }}
          />
          <div aria-live="polite">
            {hasSavedPassword && (
              <p className="tw-mb-0 tw-mt-2 tw-text-sm tw-text-iron-400">
                {t(locale, "desktop.walletPasswords.unlockHint")}
              </p>
            )}
          </div>
        </>
      )}
    </ConfirmModalShell>
  );
}
