"use client";

import {
  ConfirmModalShell,
  confirmBtnDanger,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmInputClass,
  confirmModalFooterBetween,
} from "@/components/shared/ConfirmModalShell";
import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ethers } from "ethers";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { addRpcProvider } from "../../../electron";
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
      console.error("invalid rpc url", error);
      showError("Invalid RPC URL");
      urlInputRef.current?.select();
    } finally {
      setTestingUrl(false);
    }
  }, [url]);

  return (
    <ConfirmModalShell
      show={props.show}
      title="Add RPC Provider"
      onBackdropClick={() => handleHide(false)}
      footerClassName={confirmModalFooterBetween}
      footer={
        <>
          <button
            type="button"
            onClick={() => reset()}
            className={confirmBtnDanger}
          >
            Reset
          </button>
          <span className="tw-flex tw-gap-2">
            <button
              type="button"
              onClick={() => handleHide(false)}
              className={confirmBtnSecondary}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!name || !url || addingRpcProvider}
              onClick={() => {
                setAddingRpcProvider(true);
                handleAdd();
              }}
              className={confirmBtnPrimary}
            >
              {addingRpcProvider ? <Spinner dimension={16} /> : "Add"}
            </button>
          </span>
        </>
      }
    >
      <div className="tw-text-sm">
        RPC URLs Directory:{" "}
        <Link
          href="https://ethereumnodes.com/"
          target="_blank"
          rel="noreferrer"
          className="tw-text-primary-400 tw-underline"
        >
          https://ethereumnodes.com/
        </Link>
      </div>
      <div className="tw-mt-3">
        <label className="tw-block tw-pb-1">RPC URL</label>
        <input
          ref={urlInputRef}
          disabled={urlValidation}
          autoFocus
          type="text"
          placeholder="https://..."
          value={url}
          className={confirmInputClass}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="tw-mt-2 tw-text-right">
        <button
          type="button"
          disabled={!url || urlValidation || testingUrl}
          onClick={() => {
            testRpcProvider();
            setTestingUrl(true);
          }}
          className={confirmBtnPrimary}
        >
          {urlValidation ? (
            <>
              <FontAwesomeIcon icon={faCheckCircle} color="white" height={16} />
              <span>Valid</span>
            </>
          ) : (
            <>
              {testingUrl && <Spinner dimension={16} />}
              <span>{testingUrl ? "Testing..." : "Test"}</span>
            </>
          )}
        </button>
      </div>
      <div className="tw-mt-1">
        <label className="tw-block tw-pb-1">Provider Name</label>
        <input
          ref={nameInputRef}
          disabled={!urlValidation}
          type="text"
          placeholder="My RPC Provider..."
          value={name}
          className={confirmInputClass}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <p className="tw-mb-1 tw-mt-4">
        {error ? (
          <span className="tw-text-red-400">{error}</span>
        ) : urlValidation ? (
          <>Provide a name for your new RPC provider</>
        ) : (
          <>Provide a URL for your new RPC provider and test it</>
        )}
      </p>
    </ConfirmModalShell>
  );
}
