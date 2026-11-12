"use client";

import {
  ConfirmModalShell,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmBtnSecondarySmall,
  confirmInputClass,
} from "@/components/shared/ConfirmModalShell";
import { areEqualAddresses } from "@/helpers/Helpers";
import { decryptData } from "@/shared/encrypt";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { createSeedWallet, importSeedWallet } from "../../../electron";
import { useOfferWalletPasswordSave } from "@/hooks/useOfferWalletPasswordSave";
import { useSavedWalletPassword } from "@/hooks/useSavedWalletPassword";
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
  const [saving, setSaving] = useState(false);
  const [canGenerate, setCanGenerate] = useState(false);
  const [generatedPasswordNeedsBackup, setGeneratedPasswordNeedsBackup] =
    useState(false);
  const [confirmedPasswordBackup, setConfirmedPasswordBackup] = useState(false);
  const offerSave = useOfferWalletPasswordSave();
  const locale = useBrowserLocale();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    setGeneratedPasswordNeedsBackup(false);
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
        setGeneratedPasswordNeedsBackup(true);
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

  const canSubmit =
    !saving &&
    Boolean(walletName && walletPass) &&
    (!generatedPasswordNeedsBackup || confirmedPasswordBackup);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (walletPass.length < SEED_MIN_PASS_LENGTH) {
      showError(
        `Password must be at least ${SEED_MIN_PASS_LENGTH} characters long`
      );
      return;
    }
    setError("");
    setSaving(true);
    try {
      const imported = props.import;
      const data = imported
        ? await importSeedWallet(
            walletName, walletPass, imported.address, imported.mnemonic, imported.privateKey
          )
        : await createSeedWallet(walletName, walletPass);
      if (data.error) {
        showToast(`Error ${imported ? "importing" : "creating"} wallet - ${data.data}`, "error");
        return;
      }
      const address = imported?.address ?? data.data;
      if (typeof address === "string") await offerSave(address, walletPass);
      showToast(
        imported
          ? "Wallet imported successfully!"
          : `Wallet '${walletName}' created successfully - Download Recovery File immediately!`,
        "success"
      );
      handleHide(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmModalShell
      show={props.show}
      title={`${props.import ? "Import" : "Create New"} Wallet`}
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
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={confirmBtnPrimary}
          >
            {props.import ? "Import" : "Create"}
          </button>
        </>
      }
    >
      <label htmlFor="new-wallet-name" className="tw-block tw-pb-1">
        Wallet Name
      </label>
      <input
        id="new-wallet-name"
        disabled={saving}
        autoFocus
        type="text"
        placeholder="My Wallet..."
        value={walletName}
        className={confirmInputClass}
        onChange={(e) => {
          const value = e.target.value;
          if (/^[a-zA-Z0-9 ]*$/.test(value)) setWalletName(value);
          else
            showError(
              "Name can only contain alphanumeric characters and spaces"
            );
        }}
      />
      <div className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pb-1 tw-pt-3">
        <label htmlFor="new-wallet-password">Wallet Password</label>
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
            className="tw-cursor-pointer"
          />
        </button>
      </div>
      <div className="tw-flex tw-items-center tw-gap-2">
        <input
          id="new-wallet-password"
          autoComplete="new-password"
          disabled={saving}
          type={passHidden ? "password" : "text"}
          placeholder="******"
          value={walletPass}
          className={confirmInputClass}
          onChange={(e) => {
            const value = e.target.value;
            if (/^\S*$/.test(value)) {
              setWalletPass(value);
              setConfirmedPasswordBackup(false);
              if (!value) setGeneratedPasswordNeedsBackup(false);
            } else {
              showError("Password must not contain any whitespace characters");
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
      {generatedPasswordNeedsBackup && (
        <label className="tw-mt-3 tw-flex tw-items-start tw-gap-2 tw-text-sm">
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
      <p className="tw-mb-1 tw-mt-4">
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
  const offerSave = useOfferWalletPasswordSave();
  const { hasSavedPassword, clearSavedPassword } = useSavedWalletPassword(
    props.show ? props.address : undefined
  );
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

  const canUnlock = walletPass
    ? walletPass.length >= SEED_MIN_PASS_LENGTH
    : hasSavedPassword;

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
      let password = walletPass;
      if (!password) {
        const saved = await window.walletPasswords?.request(props.address);
        if (!saved?.ok) {
          clearSavedPassword();
          showUnlockError(t(locale, "desktop.walletPasswords.manualFallback"));
          return;
        }
        password = saved.value;
      }
      const decryptedAddress = await decryptData(
        props.address,
        props.address_hashed,
        password
      );
      if (!areEqualAddresses(props.address, decryptedAddress)) {
        showUnlockError("Failed to unlock wallet");
        return;
      }
      if (walletPass) await offerSave(props.address, password);
      props.onUnlock(password);
      handleHide();
    } catch {
      if (!walletPass) clearSavedPassword();
      showUnlockError("Failed to unlock wallet");
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <ConfirmModalShell
      show={props.show}
      title="Unlock Wallet"
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
            Cancel
          </button>
          <button
            type="button"
            disabled={unlocking || !canUnlock}
            onClick={handleUnlock}
            className={confirmBtnPrimary}
          >
            {unlocking ? "Unlocking..." : "Unlock"}
          </button>
        </>
      }
    >
      <div className="tw-flex tw-select-none tw-items-center tw-justify-between tw-pb-1 tw-pt-3">
        <label htmlFor="unlock-wallet-password">Wallet Password</label>
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
          else showError("Password must not contain any whitespace characters");
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void handleUnlock();
        }}
      />
      <p className="tw-mb-1 tw-mt-4" aria-live="polite">
        {error ? (
          <span className="tw-text-red-400">{error}</span>
        ) : hasSavedPassword ? (
          t(locale, "desktop.walletPasswords.unlockHint")
        ) : (
          "Provide wallet password to continue"
        )}
      </p>
    </ConfirmModalShell>
  );
}
