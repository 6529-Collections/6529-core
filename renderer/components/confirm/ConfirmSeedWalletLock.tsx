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
    onUnlock: (password?: string, savedPasswordAttempt?: string) => Promise<boolean>;
    onLock: () => void;
  }>
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const locale = useBrowserLocale();
  const [unlocking, setUnlocking] = useState(false);
  const [walletPass, setWalletPass] = useState("");
  const [passHidden, setPassHidden] = useState(true);
  const authenticationAttempt = useRef<string>(undefined);
  const [savedUnlock, setSavedUnlock] = useState<{ address: string; attempt: string }>();
  const { showToast } = useToast();
  const { isTopModal, addModal, removeModal } = useModalState();
  const isCurrentTopModal = isTopModal(SEED_WALLET_LOCK_MODAL);
  const offerSave = useOfferWalletPasswordSave();
  const shouldAutofill = props.show && isCurrentTopModal && !props.isUnlocked;
  if (savedUnlock && (!shouldAutofill || savedUnlock.address !== props.address)) {
    setSavedUnlock(undefined);
  }
  const savedPasswordAttempt = shouldAutofill && savedUnlock?.address === props.address
    ? savedUnlock.attempt
    : undefined;
  const canUnlock = Boolean(savedPasswordAttempt) ||
    walletPass.length >= SEED_MIN_PASS_LENGTH;

  useEffect(() => {
    const bridge = window.walletPasswords;
    if (!shouldAutofill || !bridge) return;
    const attempt = crypto.randomUUID();
    authenticationAttempt.current = attempt;
    // Give the modal a chance to paint and avoid duplicate prompts on remount.
    const start = setTimeout(() => {
      if (authenticationAttempt.current !== attempt) return;
      void bridge.prepareUnlock(props.address, attempt).then((result) => {
        if (result.ok && authenticationAttempt.current === attempt) {
          setSavedUnlock({ address: props.address, attempt });
        }
      }).catch(() => {});
    }, 0);
    return () => {
      clearTimeout(start);
      if (authenticationAttempt.current === attempt) {
        authenticationAttempt.current = undefined;
      }
      void bridge.cancelUnlock(attempt).catch(() => {});
    };
  }, [props.address, shouldAutofill]);

  const handlePasswordChange = (password: string) => {
    const attempt = authenticationAttempt.current;
    authenticationAttempt.current = undefined;
    setSavedUnlock(undefined);
    if (attempt) void window.walletPasswords?.cancelUnlock(attempt).catch(() => {});
    setWalletPass(password);
  };

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

    const focusEmptyInput = () => {
      if (!inputRef.current?.value) focusPasswordInput();
    };
    const animationFrameId =
      globalThis.requestAnimationFrame?.(focusEmptyInput) ?? null;
    const focusTimeout = setTimeout(focusEmptyInput, 75);
    const settledFocusTimeout = setTimeout(focusEmptyInput, 175);

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
      const success = await props.onUnlock(walletPass || undefined, savedPasswordAttempt);
      if (!success) {
        setSavedUnlock(undefined);
        const key = walletPass
          ? "desktop.walletPasswords.unlockFailed"
          : "desktop.walletPasswords.manualFallback";
        showToast(t(locale, key), "error", true);
        focusPasswordInput();
        return;
      }
      showToast(t(locale, "desktop.walletPasswords.unlocked"), "success", true);
      setWalletPass("");
      if (walletPass &&
          !(await window.walletPasswords?.hasSavedPassword(props.address).catch(() => false))) {
        await offerSave(props.address, walletPass);
      }
    } catch {
      setSavedUnlock(undefined);
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
            {!savedPasswordAttempt && (
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
            )}
          </div>
          <input
            id="connected-wallet-password"
            readOnly={unlocking}
            autoComplete="current-password"
            ref={inputRef}
            autoFocus
            type={passHidden || savedPasswordAttempt ? "password" : "text"}
            placeholder={savedPasswordAttempt ? "••••••••••••" : undefined}
            aria-describedby={savedPasswordAttempt ? "saved-wallet-password-status" : undefined}
            value={walletPass}
            className={`${confirmInputClass}${savedPasswordAttempt ? " placeholder:!tw-text-iron-100" : ""}`}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(e) => handlePasswordChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleUnlock();
            }}
          />
          <div id="saved-wallet-password-status" aria-live="polite">
            {savedPasswordAttempt && (
              <p className="tw-mb-0 tw-mt-2 tw-text-sm tw-text-iron-400">
                {t(locale, "desktop.walletPasswords.autofilled")}
              </p>
            )}
          </div>
        </>
      )}
    </ConfirmModalShell>
  );
}
