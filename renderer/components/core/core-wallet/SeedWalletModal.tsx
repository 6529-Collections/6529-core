"use client";

import {
  ConfirmModalShell,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmBtnSecondarySmall,
  confirmInputClass,
} from "@/components/shared/ConfirmModalShell";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { createSeedWallet, importSeedWallet } from "../../../electron";
import { useOfferWalletPasswordSave } from "@/hooks/useOfferWalletPasswordSave";
import type { SeedWalletImport, WalletRecoveryField, WalletRecoveryResult } from "@/shared/wallet-passwords";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";

export const SEED_MIN_PASS_LENGTH = 6;

const showTimedError = (
  message: string,
  setError: (value: string) => void,
  timeoutRef: { current: NodeJS.Timeout | null }
) => {
  if (timeoutRef.current) clearTimeout(timeoutRef.current);
  setError(message);
  timeoutRef.current = setTimeout(() => {
    setError("");
    timeoutRef.current = null;
  }, 5000);
};

export function CreateSeedWalletModal(
  props: Readonly<{
    show: boolean;
    import?: SeedWalletImport;
    onHide: (refresh: boolean) => void;
  }>
) {
  const { showToast } = useToast();
  const [walletName, setWalletName] = useState("");
  const [walletPass, setWalletPass] = useState("");
  const [passHidden, setPassHidden] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [canGenerate, setCanGenerate] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState(false);
  const [savePasswordMyself, setSavePasswordMyself] = useState(false);
  const [confirmedPasswordBackup, setConfirmedPasswordBackup] = useState(false);
  const offerSave = useOfferWalletPasswordSave();
  const locale = useBrowserLocale();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!props.show) return;
    const bridge = window.walletPasswords;
    if (!bridge) return;
    let active = true;
    void bridge.isAvailable().then(
      (available) => {
        if (active) setCanGenerate(available);
      },
      () => {
        if (active) setCanGenerate(false);
      }
    );
    return () => {
      active = false;
    };
  }, [props.show]);

  const showError = (message: string) => {
    showTimedError(message, setError, timeoutRef);
  };

  const handleHide = (refresh: boolean) => {
    setWalletName("");
    setWalletPass("");
    setGeneratedPassword(false);
    setSavePasswordMyself(false);
    setConfirmedPasswordBackup(false);
    setError("");
    setPassHidden(true);
    props.onHide(refresh);
  };

  const generatePassword = async () => {
    setSaving(true);
    try {
      const generated = await window.walletPasswords?.generate();
      if (generated?.ok) {
        setWalletPass(generated.value);
        setGeneratedPassword(true);
        setSavePasswordMyself(false);
        setConfirmedPasswordBackup(false);
        setPassHidden(true);
        setError("");
        return;
      }
    } catch {
      // The user can still enter a password.
    } finally {
      setSaving(false);
    }
    showError(t(locale, "desktop.walletPasswords.generateFailed"));
  };

  const saveInKeychain = generatedPassword && !savePasswordMyself;
  const canSubmit =
    !saving &&
    Boolean(walletName && walletPass) &&
    (!savePasswordMyself || confirmedPasswordBackup);

  const useOwnPassword = () => {
    setWalletPass("");
    setGeneratedPassword(false);
    setSavePasswordMyself(false);
    setConfirmedPasswordBackup(false);
    setPassHidden(true);
    setError("");
    passwordInputRef.current?.focus();
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(walletPass);
      showToast(t(locale, "desktop.walletPasswords.passwordCopied"), "success");
    } catch {
      showError(t(locale, "desktop.walletPasswords.copyFailed"));
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (walletPass.length < SEED_MIN_PASS_LENGTH) {
      showError(
        t(locale, "desktop.walletPasswords.passwordTooShort", {
          count: SEED_MIN_PASS_LENGTH,
        })
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      const imported = props.import;
      const setupError = imported
        ? "desktop.walletPasswords.importFailed"
        : "desktop.walletPasswords.createFailed";
      if (saveInKeychain) {
        const result = await window.walletPasswords?.setupWithKeychain(walletName, walletPass, imported);
        if (!result?.ok) {
          setError(t(locale, result?.code === "wallet-setup-failed"
            ? setupError
            : "desktop.walletPasswords.finishKeychainSetup"));
          return;
        }
      } else {
        const data = imported
          ? await importSeedWallet(
              walletName, walletPass, imported.address, imported.mnemonic, imported.privateKey
            )
          : await createSeedWallet(walletName, walletPass);
        if (data.error) {
          showError(t(locale, setupError));
          return;
        }
        const address = imported?.address ?? data.data;
        if (!generatedPassword && typeof address === "string") {
          await offerSave(address, walletPass);
        }
      }
      showToast(
        imported
          ? t(locale, "desktop.walletPasswords.imported")
          : t(locale, "desktop.walletPasswords.created", { name: walletName }),
        "success"
      );
      handleHide(true);
    } catch {
      setError(t(locale, saveInKeychain
        ? "desktop.walletPasswords.finishKeychainSetup"
        : props.import ? "desktop.walletPasswords.importFailed" : "desktop.walletPasswords.createFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmModalShell
      show={props.show}
      title={t(
        locale,
        props.import
          ? "desktop.walletPasswords.importTitle"
          : "desktop.walletPasswords.createTitle"
      )}
      onBackdropClick={() => {
        if (!saving) handleHide(false);
      }}
      footer={
        <>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleHide(false)}
            className={confirmBtnSecondary}
          >
            {t(locale, "desktop.walletPasswords.cancel")}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={confirmBtnPrimary}
          >
            {t(
              locale,
              saveInKeychain
                ? props.import ? "desktop.walletPasswords.importAndSave" : "desktop.walletPasswords.createAndSave"
                : props.import ? "desktop.walletPasswords.import" : "desktop.walletPasswords.create"
            )}
          </button>
        </>
      }
    >
      <label htmlFor="new-wallet-name" className="tw-block tw-pb-1">
        {t(locale, "desktop.walletPasswords.walletName")}
      </label>
      <input
        id="new-wallet-name"
        disabled={saving}
        autoFocus
        type="text"
        placeholder={t(locale, "desktop.walletPasswords.walletNamePlaceholder")}
        value={walletName}
        className={confirmInputClass}
        onChange={(e) => {
          const value = e.target.value;
          if (/^[a-zA-Z0-9 ]*$/.test(value)) setWalletName(value);
          else
            showError(
              t(locale, "desktop.walletPasswords.invalidName")
            );
        }}
      />
      <div className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pb-1 tw-pt-3">
        <label htmlFor="new-wallet-password">
          {t(locale, "desktop.walletPasswords.walletPassword")}
        </label>
        {!saveInKeychain && <button
          type="button"
          disabled={saving}
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
        </button>}
      </div>
      <div className="tw-flex tw-items-center tw-gap-2">
        <input
          id="new-wallet-password"
          ref={passwordInputRef}
          aria-describedby={
            generatedPassword ? "wallet-password-backup-hint" : undefined
          }
          autoComplete="new-password"
          disabled={saving}
          readOnly={generatedPassword}
          type={passHidden ? "password" : "text"}
          placeholder="******"
          value={walletPass}
          className={confirmInputClass}
          onChange={(e) => {
            const value = e.target.value;
            if (/^\S*$/.test(value)) {
              setWalletPass(value);
            } else {
              showError(t(locale, "desktop.walletPasswords.passwordWhitespace"));
            }
          }}
        />
        {canGenerate && (
          <button
            type="button"
            className={`${confirmBtnSecondarySmall} tw-shrink-0 disabled:tw-opacity-50`}
            disabled={saving}
            onClick={() => void generatePassword()}
          >
            {t(locale, "desktop.walletPasswords.generate")}
          </button>
        )}
      </div>
      {generatedPassword && (
        <div className="tw-mt-3 tw-text-sm">
          <p id="wallet-password-backup-hint" className="tw-mb-2">
            {t(locale, saveInKeychain
              ? "desktop.walletPasswords.generatedKeychainHint"
              : "desktop.walletPasswords.backupHint")}
          </p>
          <div className="tw-flex tw-flex-wrap tw-gap-2">
            {savePasswordMyself && (
              <button type="button" className={confirmBtnSecondarySmall} disabled={saving} onClick={() => void copyPassword()}>
                {t(locale, "desktop.walletPasswords.copyPassword")}
              </button>
            )}
            <button
              type="button"
              className={confirmBtnSecondarySmall}
              disabled={saving}
              onClick={() => {
                setSavePasswordMyself(!savePasswordMyself);
                setConfirmedPasswordBackup(false);
                setPassHidden(true);
                setError("");
              }}
            >
              {t(locale, savePasswordMyself
                ? "desktop.walletPasswords.saveInKeychainInstead"
                : "desktop.walletPasswords.savePasswordMyself")}
            </button>
            <button type="button" className={confirmBtnSecondarySmall} disabled={saving} onClick={useOwnPassword}>
              {t(locale, "desktop.walletPasswords.useOwnPassword")}
            </button>
          </div>
          {savePasswordMyself && (
            <label className="tw-mt-3 tw-flex tw-items-start tw-gap-2">
              <input
                type="checkbox"
                className="tw-mt-0.5 tw-size-4 tw-shrink-0"
                checked={confirmedPasswordBackup}
                disabled={saving}
                onChange={(event) => setConfirmedPasswordBackup(event.target.checked)}
              />
              {t(locale, "desktop.walletPasswords.confirmBackup")}
            </label>
          )}
        </div>
      )}
      <p className="tw-mb-1 tw-mt-4" aria-live="polite">
        {error ? (
          <span className="tw-text-red-400">{error}</span>
        ) : !generatedPassword && (
          t(locale, "desktop.walletPasswords.setupPrompt")
        )}
      </p>
    </ConfirmModalShell>
  );
}

export function UnlockSeedWalletModal(
  props: Readonly<{
    show: boolean;
    address: string;
    field: WalletRecoveryField;
    onUnlock: (result: WalletRecoveryResult) => void;
    onHide: () => void;
  }>
) {
  const [walletPass, setWalletPass] = useState("");
  const locale = useBrowserLocale();
  const [passHidden, setPassHidden] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showError = (message: string) => {
    showTimedError(message, setError, timeoutRef);
  };

  const handleHide = () => {
    setWalletPass("");
    setError("");
    setPassHidden(true);
    props.onHide();
  };

  const canUnlock = walletPass.length >= SEED_MIN_PASS_LENGTH;

  const showUnlockError = (message: string) => {
    showError(message);
    inputRef.current?.focus();
    inputRef.current?.select();
  };

  const handleUnlock = async () => {
    if (unlocking || !canUnlock) return;
    setError("");
    setUnlocking(true);
    try {
      const result = await window.walletPasswords?.recover(
        props.address, props.field, walletPass
      );
      if (!result?.ok) {
        if (result?.code === "cancelled") return;
        showUnlockError(t(locale, "desktop.walletPasswords.unlockFailed"));
        return;
      }
      props.onUnlock(result.value);
      handleHide();
    } catch {
      showUnlockError(t(locale, "desktop.walletPasswords.unlockFailed"));
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <ConfirmModalShell
      show={props.show}
      title={t(locale, "desktop.walletPasswords.unlockTitle")}
      onBackdropClick={() => {
        if (!unlocking) handleHide();
      }}
      footer={
        <>
          <button
            type="button"
            disabled={unlocking}
            onClick={handleHide}
            className={confirmBtnSecondary}
          >
            {t(locale, "desktop.walletPasswords.cancel")}
          </button>
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
        </>
      }
    >
      <div className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pb-1 tw-pt-3">
        <label htmlFor="unlock-wallet-password">
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
        id="unlock-wallet-password"
        readOnly={unlocking}
        autoComplete="current-password"
        ref={inputRef}
        autoFocus
        type={passHidden ? "password" : "text"}
        placeholder="******"
        value={walletPass}
        className={confirmInputClass}
        onChange={(e) => {
          const value = e.target.value;
          if (/^\S*$/.test(value)) setWalletPass(value);
          else showError(t(locale, "desktop.walletPasswords.passwordWhitespace"));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void handleUnlock();
        }}
      />
      <p className="tw-mb-1 tw-mt-4" aria-live="polite">
        {error ? (
          <span className="tw-text-red-400">{error}</span>
        ) : (
          t(locale, "desktop.walletPasswords.unlockPrompt")
        )}
      </p>
    </ConfirmModalShell>
  );
}
