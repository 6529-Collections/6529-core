"use client";

import {
  ConfirmModalShell,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmInputClass,
} from "@/components/shared/ConfirmModalShell";
import { NON_WALLET_MODAL_OVERLAY_CLASS } from "@/components/shared/modal-layers";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";
import { parseTransactionHashSearch } from "@/shared/transaction-hash-search";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";

export default function TransactionSearchModal({
  show,
  initialValue,
  onHide,
  onSearch,
}: {
  readonly show: boolean;
  readonly initialValue: string;
  readonly onHide: () => void;
  readonly onSearch: (value: string) => void;
}) {
  const locale = useBrowserLocale();
  const formId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState(initialValue);
  const [showValidationError, setShowValidationError] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parseTransactionHashSearch(searchValue)) {
      setShowValidationError(true);
      inputRef.current?.focus();
      return;
    }

    onSearch(searchValue.trim());
  };

  return (
    <ConfirmModalShell
      show={show}
      title={t(locale, "core.ethScanner.transactionsData.search.title")}
      initialFocusRef={inputRef}
      overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
      dialogClassName="!tw-max-w-2xl"
      onBackdropClick={onHide}
      footer={
        <>
          <button
            type="button"
            onClick={onHide}
            className={confirmBtnSecondary}
          >
            {t(locale, "core.ethScanner.transactionsData.search.cancel")}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={searchValue.trim().length === 0}
            className={confirmBtnPrimary}
          >
            {t(locale, "core.ethScanner.transactionsData.search.submit")}
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate>
        <label
          htmlFor={`${formId}-transaction-hash`}
          className="tw-block tw-text-sm tw-font-medium tw-text-iron-200"
        >
          {t(locale, "core.ethScanner.transactionsData.search.label")}
        </label>
        <p
          id={descriptionId}
          className="tw-mb-2 tw-mt-1 tw-text-sm tw-text-iron-400"
        >
          {t(locale, "core.ethScanner.transactionsData.search.description")}
        </p>
        <div className="tw-relative">
          <input
            ref={inputRef}
            id={`${formId}-transaction-hash`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={searchValue}
            aria-invalid={showValidationError}
            aria-describedby={
              showValidationError
                ? `${descriptionId} ${errorId}`
                : descriptionId
            }
            onChange={(event) => {
              setSearchValue(event.target.value.trimStart());
              if (showValidationError) {
                setShowValidationError(false);
              }
            }}
            className={`${confirmInputClass} tw-pr-12`}
            placeholder={t(
              locale,
              "core.ethScanner.transactionsData.search.placeholder"
            )}
          />
          {searchValue.length > 0 && (
            <button
              type="button"
              aria-label={t(
                locale,
                "core.ethScanner.transactionsData.search.clear"
              )}
              onClick={() => {
                setSearchValue("");
                setShowValidationError(false);
                inputRef.current?.focus();
              }}
              className="tw-absolute tw-right-1 tw-top-1/2 tw-inline-flex tw-h-8 tw-w-8 -tw-translate-y-1/2 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-md tw-border-0 tw-bg-transparent tw-p-0 tw-text-iron-300 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-iron-700 desktop-hover:hover:tw-text-white"
            >
              <FontAwesomeIcon
                icon={faXmark}
                className="tw-h-4 tw-w-4"
                aria-hidden="true"
              />
            </button>
          )}
        </div>
        {showValidationError && (
          <p
            id={errorId}
            role="alert"
            className="tw-text-red-400 tw-mb-0 tw-mt-2 tw-text-sm"
          >
            {t(locale, "core.ethScanner.transactionsData.search.invalid")}
          </p>
        )}
      </form>
    </ConfirmModalShell>
  );
}
