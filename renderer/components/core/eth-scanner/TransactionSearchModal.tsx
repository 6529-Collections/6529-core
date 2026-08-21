"use client";

import {
  ConfirmModalShell,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmInputClass,
} from "@/components/shared/ConfirmModalShell";
import { NON_WALLET_MODAL_OVERLAY_CLASS } from "@/components/shared/modal-layers";
import type { Transaction } from "@/entities/ITransaction";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { formatInteger } from "@/i18n/format";
import { t } from "@/i18n/messages";
import type { PaginatedResponseLocal } from "@/shared/types";
import { parseTransactionHashSearch } from "@/shared/transaction-hash-search";
import { useCallback, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import DotLoader from "../../dotLoader/DotLoader";
import LatestActivityRow from "../../latest-activity/LatestActivityRow";
import Pagination from "../../pagination/Pagination";

const SEARCH_PAGE_SIZE = 10;

type RawTransaction = Omit<Transaction, "transaction_date"> & {
  readonly transaction_date: number;
};

type RawTransactionResponse = PaginatedResponseLocal<RawTransaction>;

export default function TransactionSearchModal({
  show,
  onHide,
}: {
  readonly show: boolean;
  readonly onHide: () => void;
}) {
  const locale = useBrowserLocale();
  const formId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const latestRequestId = useRef(0);
  const [searchValue, setSearchValue] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [results, setResults] = useState<PaginatedResponseLocal<Transaction>>();
  const [isLoading, setIsLoading] = useState(false);
  const [showValidationError, setShowValidationError] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);

  const resetAndHide = useCallback(() => {
    latestRequestId.current += 1;
    setSearchValue("");
    setSubmittedSearch("");
    setResults(undefined);
    setIsLoading(false);
    setShowValidationError(false);
    setSearchFailed(false);
    onHide();
  }, [onHide]);

  const runSearch = useCallback((value: string, page: number) => {
    if (!parseTransactionHashSearch(value)) {
      latestRequestId.current += 1;
      setSubmittedSearch("");
      setResults(undefined);
      setIsLoading(false);
      setSearchFailed(false);
      setShowValidationError(true);
      inputRef.current?.focus();
      return;
    }

    const requestId = ++latestRequestId.current;
    const normalizedValue = value.trim();
    setSubmittedSearch(normalizedValue);
    setShowValidationError(false);
    setSearchFailed(false);
    setIsLoading(true);

    window.localDb
      .getTransactions(
        undefined,
        undefined,
        page,
        SEARCH_PAGE_SIZE,
        undefined,
        normalizedValue,
        "DESC"
      )
      .then((response: RawTransactionResponse) => {
        if (requestId !== latestRequestId.current) return;

        const normalizedResponse: PaginatedResponseLocal<Transaction> = {
          ...response,
          data: response.data.map((transaction) => ({
            ...transaction,
            transaction_date: new Date(transaction.transaction_date * 1000),
          })),
        };
        setResults(normalizedResponse);
      })
      .catch(() => {
        if (requestId !== latestRequestId.current) return;
        setResults(undefined);
        setSearchFailed(true);
      })
      .finally(() => {
        if (requestId === latestRequestId.current) {
          setIsLoading(false);
        }
      });
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(searchValue, 1);
  };

  return (
    <ConfirmModalShell
      show={show}
      title={t(locale, "core.ethScanner.transactionsData.search.title")}
      initialFocusRef={inputRef}
      overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
      dialogClassName="!tw-max-w-5xl tw-overflow-hidden"
      bodyClassName="tw-max-h-[65vh] tw-overflow-y-auto"
      onBackdropClick={resetAndHide}
      footer={
        <>
          <button
            type="button"
            onClick={resetAndHide}
            className={confirmBtnSecondary}
          >
            {t(locale, "core.ethScanner.transactionsData.search.cancel")}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={isLoading || searchValue.trim().length === 0}
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
        <input
          ref={inputRef}
          id={`${formId}-transaction-hash`}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={searchValue}
          aria-invalid={showValidationError}
          aria-describedby={
            showValidationError ? `${descriptionId} ${errorId}` : descriptionId
          }
          onChange={(event) => {
            setSearchValue(event.target.value.trimStart());
            if (showValidationError) {
              setShowValidationError(false);
            }
          }}
          className={confirmInputClass}
          placeholder={t(
            locale,
            "core.ethScanner.transactionsData.search.placeholder"
          )}
        />
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

      <div className="tw-mt-6" aria-live="polite" aria-busy={isLoading}>
        {isLoading && (
          <div className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-iron-300">
            <span aria-hidden="true">
              <DotLoader />
            </span>
            <span>
              {t(locale, "core.ethScanner.transactionsData.search.loading")}
            </span>
          </div>
        )}

        {!isLoading && searchFailed && (
          <p role="alert" className="tw-text-red-400 tw-m-0 tw-text-sm">
            {t(locale, "core.ethScanner.transactionsData.search.error")}
          </p>
        )}

        {!isLoading && !searchFailed && results && (
          <>
            <p className="tw-mb-3 tw-mt-0 tw-text-sm tw-font-medium tw-text-iron-200">
              {t(locale, "core.ethScanner.transactionsData.search.total", {
                count: formatInteger(locale, results.total),
              })}
            </p>

            {results.total === 0 ? (
              <p className="tw-m-0 tw-text-sm tw-text-iron-400">
                {t(locale, "core.ethScanner.transactionsData.search.empty")}
              </p>
            ) : (
              <>
                <div className="tw-overflow-x-auto [&_tbody_tr:nth-child(even)]:tw-bg-transparent [&_tbody_tr:nth-child(odd)]:tw-bg-black">
                  <table className="tw-w-full tw-table-auto tw-border-collapse">
                    <tbody className="[&>tr>td:first-child]:tw-w-px [&>tr>td]:tw-whitespace-nowrap [&>tr>td]:tw-p-2 [&>tr]:tw-leading-10">
                      {results.data.map((transaction) => (
                        <LatestActivityRow
                          tr={transaction}
                          key={`${transaction.contract}-${transaction.from_address}-${transaction.to_address}-${transaction.transaction}-${transaction.token_id}`}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {results.total > SEARCH_PAGE_SIZE && (
                  <div className="tw-mt-4 tw-text-center">
                    <Pagination
                      page={results.page}
                      pageSize={SEARCH_PAGE_SIZE}
                      totalResults={results.total}
                      setPage={(page) => runSearch(submittedSearch, page)}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </ConfirmModalShell>
  );
}
