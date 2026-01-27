"use client";

import {
  faCheckCircle,
  faCircleArrowLeft,
  faPlusCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ethers } from "ethers";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MNEMONIC_NA } from "../../../../electron-constants";
import { useToast } from "../../../contexts/ToastContext";
import { getRandomKey } from "../../../helpers";
import { CreateSeedWalletModal } from "./SeedWalletModal";

const tabBase =
  "tw-w-full tw-cursor-pointer tw-rounded-xl tw-border-0 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500";

export default function SeedWalletImport() {
  const [isMnemonic, setIsMnemonic] = useState(true);

  return (
    <>
      <div className="tw-pt-5">
        <div>
          <Link
            className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-no-underline tw-text-inherit hover:tw-underline"
            href="/core/core-wallets"
          >
            <FontAwesomeIcon icon={faCircleArrowLeft} height={16} />
            Back to 6529 Desktop Wallets
          </Link>
        </div>
        <div className="tw-pt-4">
          <h1 className="tw-m-0">
            <span className="tw-text-iron-400">Import</span> Seed Wallet
          </h1>
        </div>
        <div className="tw-grid tw-grid-cols-2 tw-gap-2 tw-pt-4">
          <button
            type="button"
            onClick={() => setIsMnemonic(true)}
            className={`${tabBase} ${isMnemonic ? "tw-bg-cyan-600 tw-text-white" : "tw-bg-iron-800 tw-text-iron-300 tw-ring-1 tw-ring-inset tw-ring-iron-600"}`}
          >
            Mnemonic
          </button>
          <button
            type="button"
            onClick={() => setIsMnemonic(false)}
            className={`${tabBase} ${!isMnemonic ? "tw-bg-cyan-600 tw-text-white" : "tw-bg-iron-800 tw-text-iron-300 tw-ring-1 tw-ring-inset tw-ring-iron-600"}`}
          >
            Private Key
          </button>
        </div>
      </div>
      {isMnemonic ? (
        <SeedWalletImportMnemonic />
      ) : (
        <SeedWalletImportPrivateKey />
      )}
    </>
  );
}

function SeedWalletImportMnemonic() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const [phrase, setPhrase] = useState<string[]>(Array(12).fill(""));
  const [isReadonly, setIsReadonly] = useState(false);

  const [currentFocus, setCurrentFocus] = useState(0);

  const [error, setError] = useState("");
  const [validatedWallet, setValidatedWallet] = useState<
    ethers.Wallet | ethers.HDNodeWallet
  >();

  const clear = () => {
    setPhrase(Array(12).fill(""));
    setError("");
    setIsReadonly(false);
    setValidatedWallet(undefined);
    setCurrentFocus(0);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const validate = () => {
    setIsReadonly(true);
    try {
      const wallet = ethers.Wallet.fromPhrase(phrase.join(" "));
      setValidatedWallet(wallet);
    } catch (e: any) {
      setError(`Error: ${e.message}`);
    }
  };

  function isCompletePhrase() {
    return phrase.every((w) => w);
  }

  const btnAction =
    "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-px-4 tw-py-2 tw-text-sm tw-font-semibold tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950 disabled:tw-opacity-50";

  return (
    <div className="tw-pt-3 tw-pb-5">
      <div className="tw-grid tw-grid-cols-2 tw-gap-2 sm:tw-grid-cols-3 md:tw-grid-cols-4">
        {phrase.map((w, i) => (
          <div className="tw-py-2" key={getRandomKey()}>
            <div className="tw-rounded-xl tw-border tw-border-iron-700 tw-p-4">
              <div className="tw-flex tw-gap-2">
                <span className="tw-font-light tw-text-iron-400">{i + 1}</span>
                <input
                  autoFocus={i === currentFocus}
                  type="text"
                  placeholder={`word ${i + 1}`}
                  value={w}
                  className="tw-w-full tw-border-0 tw-bg-transparent tw-text-inherit tw-outline-none placeholder:tw-text-iron-500"
                  onChange={(e) => {
                    const newPhrase = e.target.value;
                    if (/^[a-z]*$/.test(newPhrase)) {
                      setPhrase((prev) => {
                        const currentPhrase = [...prev];
                        currentPhrase[i] = newPhrase;
                        return currentPhrase;
                      });
                    } else {
                      showToast(
                        "Mnemonic word can only contain lowercase alphabet characters",
                        "error",
                        true
                      );
                    }
                  }}
                  onFocus={() => setCurrentFocus(i)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="tw-mt-4 tw-flex tw-items-center tw-justify-between">
        <button
          type="button"
          onClick={clear}
          disabled={!phrase.some((w) => w) && !isCompletePhrase()}
          className={`${btnAction} tw-bg-amber-600 tw-text-white focus-visible:tw-ring-amber-500 desktop-hover:hover:tw-bg-amber-500`}
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!isCompletePhrase() || isReadonly}
          onClick={validate}
          className={`${btnAction} tw-bg-primary-500 tw-text-white focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-600`}
        >
          Validate
        </button>
      </div>
      {error && <ValidationError error={error} />}
      {validatedWallet && (
        <ValidatedWallet wallet={validatedWallet} mnemonic={phrase.join(" ")} />
      )}
    </div>
  );
}

function SeedWalletImportPrivateKey() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [privateKey, setPrivateKey] = useState("");
  const [isReadonly, setIsReadonly] = useState(false);

  const [error, setError] = useState("");
  const [validatedWallet, setValidatedWallet] = useState<
    ethers.Wallet | ethers.HDNodeWallet
  >();

  const clear = () => {
    setPrivateKey("");
    setError("");
    setIsReadonly(false);
    setValidatedWallet(undefined);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const validate = () => {
    setIsReadonly(true);
    try {
      const wallet = new ethers.Wallet(privateKey);
      setValidatedWallet(wallet);
    } catch (e: any) {
      setError(`Error: ${e.message}`);
    }
  };

  const btnAction =
    "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-px-4 tw-py-2 tw-text-sm tw-font-semibold tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950 disabled:tw-opacity-50";

  return (
    <div className="tw-pt-3 tw-pb-5">
      <div className="tw-py-2">
        <div className="tw-rounded-xl tw-border tw-border-iron-700 tw-p-4">
          <input
            ref={inputRef}
            autoFocus
            disabled={isReadonly}
            type="text"
            placeholder="private key"
            value={privateKey}
            className="tw-w-full tw-border-0 tw-bg-transparent tw-text-inherit tw-outline-none placeholder:tw-text-iron-500"
            onChange={(e) => setPrivateKey(e.target.value)}
          />
        </div>
      </div>
      <div className="tw-mt-4 tw-flex tw-items-center tw-justify-between">
        <button
          type="button"
          onClick={clear}
          disabled={!privateKey}
          className={`${btnAction} tw-bg-amber-600 tw-text-white focus-visible:tw-ring-amber-500 desktop-hover:hover:tw-bg-amber-500`}
        >
          Clear
        </button>
        <button
          type="button"
          disabled={!privateKey || isReadonly}
          onClick={validate}
          className={`${btnAction} tw-bg-primary-500 tw-text-white focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-600`}
        >
          Validate
        </button>
      </div>
      {error && <ValidationError error={error} />}
      {validatedWallet && (
        <ValidatedWallet wallet={validatedWallet} mnemonic={MNEMONIC_NA} />
      )}
    </div>
  );
}

function ValidationError(props: Readonly<{ error: string }>) {
  return (
    <div className="tw-pt-3 tw-text-red-400">
      <div>{props.error}</div>
      <div>- Clear the form and try again</div>
    </div>
  );
}

function ValidatedWallet(
  props: Readonly<{
    wallet: ethers.Wallet | ethers.HDNodeWallet;
    mnemonic: string;
  }>
) {
  return (
    <div className="tw-pt-4">
      <div className="tw-flex tw-items-center tw-gap-2 tw-text-emerald-400">
        <FontAwesomeIcon icon={faCheckCircle} height={22} />
        Private Key is Valid!
      </div>
      <div className="tw-pt-2">- Address: {props.wallet.address}</div>
      <div className="tw-pt-3">
        <ImportWallet wallet={props.wallet} mnemonic={props.mnemonic} />
      </div>
    </div>
  );
}

function ImportWallet(
  props: Readonly<{
    wallet: ethers.Wallet | ethers.HDNodeWallet;
    mnemonic: string;
  }>
) {
  const router = useRouter();
  const [showImportModal, setShowImportModal] = useState(false);

  return (
    <div className="tw-flex tw-gap-2">
      <CreateSeedWalletModal
        show={showImportModal}
        onHide={(refresh: boolean) => {
          setShowImportModal(false);
          if (refresh) router.push("/core/core-wallets");
        }}
        import={{
          address: props.wallet.address,
          mnemonic: props.mnemonic,
          privateKey: props.wallet.privateKey,
        }}
      />
      <button
        type="button"
        onClick={() => setShowImportModal(true)}
        className="tw-inline-flex tw-cursor-pointer tw-items-center tw-gap-2 tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-px-4 tw-py-2 tw-text-sm tw-font-medium tw-text-white tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950 desktop-hover:hover:tw-bg-primary-600"
      >
        <FontAwesomeIcon icon={faPlusCircle} height={16} /> Import Wallet
      </button>
    </div>
  );
}
