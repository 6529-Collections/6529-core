"use client";

import {
  GRADIENT_CONTRACT,
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
  NEXTGEN_CONTRACT,
} from "@/constants/constants";
import type { Transaction } from "@/entities/ITransaction";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { formatInteger } from "@/i18n/format";
import { t } from "@/i18n/messages";
import type { PaginatedResponseLocal } from "@/shared/types";
import {
  faChevronDown,
  faChevronUp,
  faRefresh,
  faSearch,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "react-tooltip";
import DotLoader from "../../dotLoader/DotLoader";
import LatestActivityRow from "../../latest-activity/LatestActivityRow";
import Pagination from "../../pagination/Pagination";
import { normalizeLocalTransactionResponse } from "./local-transaction-response";
import TransactionSearchModal from "./TransactionSearchModal";

type TransactionSortDirection = "ASC" | "DESC";

const SORT_DIRECTION_OPTIONS = [
  {
    actionLabelKey:
      "core.ethScanner.transactionsData.actions.sortAscending",
    icon: faChevronUp,
    tooltipId: "sort-transactions-ascending-tooltip",
    value: "ASC",
  },
  {
    actionLabelKey:
      "core.ethScanner.transactionsData.actions.sortDescending",
    icon: faChevronDown,
    tooltipId: "sort-transactions-descending-tooltip",
    value: "DESC",
  },
] as const satisfies ReadonlyArray<{
  readonly actionLabelKey: string;
  readonly icon: typeof faChevronUp;
  readonly tooltipId: string;
  readonly value: TransactionSortDirection;
}>;

const initialQueryParams = {
  contractAddress: "",
  transactionHash: "",
  startDate: undefined as string | undefined,
  endDate: undefined as string | undefined,
  page: 1,
  limit: 10,
  sortDirection: "DESC" as TransactionSortDirection,
};

export default function TransactionsLocalData() {
  const locale = useBrowserLocale();
  const [transactions, setTransactions] =
    useState<PaginatedResponseLocal<Transaction>>();
  const [queryParams, setQueryParams] = useState(initialQueryParams);
  const [showTransactionSearch, setShowTransactionSearch] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const latestRequestId = useRef(0);

  const fetchTransactions = useCallback(() => {
    const requestId = ++latestRequestId.current;
    setIsLoading(true);
    const {
      startDate,
      endDate,
      page,
      limit,
      contractAddress,
      transactionHash,
      sortDirection,
    } = queryParams;

    window.localDb
      .getTransactions(
        Number((Number(startDate) / 1000).toFixed(0)),
        Number((Number(endDate) / 1000).toFixed(0)),
        page,
        limit,
        contractAddress,
        transactionHash,
        sortDirection
      )
      .then((transactions) => {
        if (requestId !== latestRequestId.current) return;
        setTransactions(normalizeLocalTransactionResponse(transactions));
      })
      .catch(() => {
        if (requestId === latestRequestId.current) {
          setTransactions(undefined);
        }
      })
      .finally(() => {
        if (requestId === latestRequestId.current) {
          setIsLoading(false);
        }
      });
  }, [queryParams]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const updateQueryParams = (
    updates: Partial<typeof queryParams>,
    resetPage = true
  ) => {
    setQueryParams((prev) => ({
      ...prev,
      ...updates,
      page: resetPage ? 1 : (updates.page ?? prev.page),
    }));
  };

  const clearFiltersEnabled = useMemo(
    () =>
      queryParams.contractAddress !== initialQueryParams.contractAddress ||
      queryParams.transactionHash !== initialQueryParams.transactionHash ||
      queryParams.startDate !== initialQueryParams.startDate ||
      queryParams.endDate !== initialQueryParams.endDate ||
      queryParams.page !== initialQueryParams.page ||
      queryParams.limit !== initialQueryParams.limit ||
      queryParams.sortDirection !== initialQueryParams.sortDirection,
    [queryParams]
  );

  return (
    <div className="tw-mt-4">
      <div className="tw-mb-6 tw-flex tw-flex-wrap tw-items-end tw-justify-between tw-gap-4">
        <div className="tw-flex tw-flex-wrap tw-items-end tw-gap-4">
          <div className="tw-flex tw-flex-col tw-gap-2">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(locale, "core.ethScanner.transactionsData.filters.hash")}
            </span>
            <button
              type="button"
              data-tooltip-id="search-local-transactions-tooltip"
              aria-label={t(
                locale,
                "core.ethScanner.transactionsData.actions.searchTransactions"
              )}
              aria-haspopup="dialog"
              onClick={() => setShowTransactionSearch(true)}
              className="tw-inline-flex tw-h-10 tw-w-10 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-white tw-p-0 tw-text-black tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-iron-200"
            >
              <FontAwesomeIcon
                icon={faSearch}
                className="tw-h-4 tw-w-4"
                aria-hidden="true"
              />
            </button>
            <Tooltip
              id="search-local-transactions-tooltip"
              place="top-start"
              style={{
                backgroundColor: "#1F2937",
                color: "white",
                padding: "4px 8px",
              }}
              delayShow={150}
              openEvents={{ mouseenter: true, focus: true }}
              closeEvents={{ mouseleave: true, blur: true, click: true }}
            >
              {t(
                locale,
                "core.ethScanner.transactionsData.actions.searchTransactions"
              )}
            </Tooltip>
          </div>

          <label className="tw-flex tw-flex-col tw-gap-2">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(
                locale,
                "core.ethScanner.transactionsData.filters.startDate"
              )}
            </span>
            <input
              type="date"
              value={
                queryParams.startDate
                  ? new Date(Number(queryParams.startDate) + 86400000)
                      .toISOString()
                      .split("T")[0]
                  : ""
              }
              onChange={(e) =>
                updateQueryParams({
                  startDate: e.target.value
                    ? new Date(new Date(e.target.value).setHours(0, 0, 0, 0))
                        .getTime()
                        .toString()
                    : undefined,
                })
              }
              className="tw-h-10 tw-w-fit tw-rounded-lg tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
            />
          </label>

          <label className="tw-flex tw-flex-col tw-gap-2">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(locale, "core.ethScanner.transactionsData.filters.endDate")}
            </span>
            <input
              type="date"
              value={
                queryParams.endDate
                  ? new Date(Number(queryParams.endDate))
                      .toISOString()
                      .split("T")[0]
                  : ""
              }
              onChange={(e) =>
                updateQueryParams({
                  endDate: e.target.value
                    ? new Date(
                        new Date(e.target.value).setHours(23, 59, 59, 999)
                      )
                        .getTime()
                        .toString()
                    : undefined,
                })
              }
              className="tw-h-10 tw-w-fit tw-rounded-lg tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
            />
          </label>

          <label className="tw-flex tw-flex-col tw-gap-2">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(locale, "core.ethScanner.transactionsData.filters.pageSize")}
            </span>
            <select
              value={queryParams.limit}
              onChange={(e) =>
                updateQueryParams({ limit: Number(e.target.value) })
              }
              className="tw-h-10 tw-w-fit tw-rounded-lg tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>

          <label className="tw-flex tw-flex-col tw-gap-2">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(locale, "core.ethScanner.transactionsData.filters.contract")}
            </span>
            <select
              value={queryParams.contractAddress}
              onChange={(e) =>
                updateQueryParams({ contractAddress: e.target.value })
              }
              className="tw-h-10 tw-w-fit tw-rounded-lg tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
            >
              <option value="">
                {t(
                  locale,
                  "core.ethScanner.transactionsData.contracts.all"
                )}
              </option>
              <option value={MEMES_CONTRACT}>
                {t(
                  locale,
                  "core.ethScanner.transactionsData.contracts.memes"
                )}
              </option>
              <option value={GRADIENT_CONTRACT}>
                {t(
                  locale,
                  "core.ethScanner.transactionsData.contracts.gradient"
                )}
              </option>
              <option value={NEXTGEN_CONTRACT}>
                {t(
                  locale,
                  "core.ethScanner.transactionsData.contracts.nextgen"
                )}
              </option>
              <option value={MEMELAB_CONTRACT}>
                {t(
                  locale,
                  "core.ethScanner.transactionsData.contracts.memelab"
                )}
              </option>
            </select>
          </label>

          <div className="tw-flex tw-flex-col tw-gap-2">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(
                locale,
                "core.ethScanner.transactionsData.filters.sortDirection"
              )}
            </span>
            <div
              className="tw-flex tw-items-center tw-gap-2"
              role="group"
              aria-label={t(
                locale,
                "core.ethScanner.transactionsData.filters.sortDirection"
              )}
            >
              {SORT_DIRECTION_OPTIONS.map((option) => {
                const active = queryParams.sortDirection === option.value;
                return (
                  <span key={option.value} className="tw-inline-flex">
                    <button
                      type="button"
                      data-tooltip-id={option.tooltipId}
                      aria-label={t(locale, option.actionLabelKey)}
                      aria-pressed={active}
                      disabled={active}
                      onClick={() =>
                        updateQueryParams({ sortDirection: option.value })
                      }
                      className={`tw-inline-flex tw-h-10 tw-w-10 tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-p-0 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 ${
                        active
                          ? "tw-cursor-default tw-bg-iron-100 tw-text-black"
                          : "tw-cursor-pointer tw-bg-iron-700 tw-text-iron-100 desktop-hover:hover:tw-bg-iron-600"
                      }`}
                    >
                      <FontAwesomeIcon
                        icon={option.icon}
                        className="tw-h-4 tw-w-4"
                        aria-hidden="true"
                      />
                    </button>
                    <Tooltip
                      id={option.tooltipId}
                      style={{
                        backgroundColor: "#1F2937",
                        color: "white",
                        padding: "4px 8px",
                      }}
                      delayShow={150}
                      openEvents={{ mouseenter: true, focus: true }}
                      closeEvents={{
                        mouseleave: true,
                        blur: true,
                        click: true,
                      }}
                    >
                      {t(locale, option.actionLabelKey)}
                    </Tooltip>
                  </span>
                );
              })}
            </div>
          </div>

          {clearFiltersEnabled && (
            <button
              type="button"
              aria-label={t(
                locale,
                "core.ethScanner.transactionsData.actions.clearFilters"
              )}
              onClick={() => {
                setQueryParams(initialQueryParams);
              }}
              className="tw-inline-flex tw-h-10 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border tw-border-solid tw-border-white/10 tw-bg-transparent tw-px-3 tw-text-sm tw-font-medium tw-text-iron-300 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-border-white/20 desktop-hover:hover:tw-bg-white/[0.06] desktop-hover:hover:tw-text-white"
            >
              {t(locale, "common.clearFilters")}
            </button>
          )}
        </div>
        <div className="tw-flex tw-items-center tw-gap-2">
          <button
            type="button"
            data-tooltip-id="refresh-transaction-results-tooltip"
            aria-label={t(
              locale,
              "core.ethScanner.transactionsData.actions.refreshResults"
            )}
            onClick={fetchTransactions}
            className="tw-inline-flex tw-h-10 tw-w-10 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-white tw-p-0 tw-text-black tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-iron-200"
          >
            <FontAwesomeIcon
              icon={faRefresh}
              className="tw-h-4 tw-w-4"
              aria-hidden="true"
            />
          </button>
          <Tooltip
            id="refresh-transaction-results-tooltip"
            style={{
              backgroundColor: "#1F2937",
              color: "white",
              padding: "4px 8px",
            }}
            delayShow={150}
            openEvents={{ mouseenter: true, focus: true }}
            closeEvents={{ mouseleave: true, blur: true, click: true }}
          >
            {t(
              locale,
              "core.ethScanner.transactionsData.actions.refreshResults"
            )}
          </Tooltip>
        </div>
      </div>

      <div className="tw-mb-6 tw-flex tw-flex-wrap tw-items-center tw-gap-4">
        <div
          className="tw-text-xl tw-font-semibold"
          aria-live="polite"
          aria-busy={isLoading}
        >
          {queryParams.transactionHash
            ? t(locale, "core.ethScanner.transactionsData.search.total", {
                count: transactions
                  ? formatInteger(locale, transactions.total)
                  : "-",
              })
            : t(locale, "core.ethScanner.transactionsData.summary.total", {
                count: transactions
                  ? formatInteger(locale, transactions.total)
                  : "-",
              })}
          {isLoading && (
            <span className="tw-ml-2 tw-inline-flex tw-align-middle">
              <span className="tw-sr-only">
                {t(
                  locale,
                  "core.ethScanner.transactionsData.summary.loading"
                )}
              </span>
              <span aria-hidden="true">
                <DotLoader />
              </span>
            </span>
          )}
        </div>
        {queryParams.transactionHash && (
          <div className="tw-inline-flex tw-max-w-full tw-items-center tw-gap-1 tw-rounded-full tw-border tw-border-solid tw-border-primary-400/40 tw-bg-primary-500/10 tw-py-1 tw-pl-3 tw-pr-1 tw-text-sm tw-font-medium tw-text-primary-200">
            <span
              className="tw-max-w-[24rem] tw-truncate"
              title={queryParams.transactionHash}
            >
              {t(
                locale,
                "core.ethScanner.transactionsData.search.activeFilter",
                { hash: queryParams.transactionHash }
              )}
            </span>
            <button
              type="button"
              aria-label={t(
                locale,
                "core.ethScanner.transactionsData.search.clearApplied"
              )}
              onClick={() => updateQueryParams({ transactionHash: "" })}
              className="tw-inline-flex tw-h-7 tw-w-7 tw-shrink-0 tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-full tw-border-0 tw-bg-transparent tw-p-0 tw-text-primary-200 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-400/20 desktop-hover:hover:tw-text-white"
            >
              <FontAwesomeIcon
                icon={faXmark}
                className="tw-h-3.5 tw-w-3.5"
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>

      <div className="tw-overflow-x-auto [&_tbody_tr:nth-child(odd)]:tw-bg-black [&_tbody_tr:nth-child(even)]:tw-bg-transparent">
        <table className="tw-w-full tw-table-auto tw-border-collapse">
          <tbody className="[&>tr]:tw-leading-10 [&>tr>td]:tw-whitespace-nowrap [&>tr>td]:tw-p-2 [&>tr>td:first-child]:tw-w-px">
            {transactions?.data.map((transaction) => (
              <LatestActivityRow
                tr={transaction}
                key={`${transaction.contract}-${transaction.from_address}-${transaction.to_address}-${transaction.transaction}-${transaction.token_id}`}
              />
            ))}
          </tbody>
        </table>
      </div>

      {!isLoading &&
        queryParams.transactionHash &&
        transactions?.total === 0 && (
          <p className="tw-m-0 tw-text-sm tw-text-iron-400">
            {t(locale, "core.ethScanner.transactionsData.search.empty")}
          </p>
        )}

      {transactions?.total && transactions?.total > queryParams.limit ? (
        <div className="tw-mt-4 tw-text-center">
          <Pagination
            page={queryParams.page}
            pageSize={queryParams.limit}
            totalResults={transactions?.total}
            setPage={function (newPage: number) {
              updateQueryParams({ page: newPage }, false);
            }}
          />
        </div>
      ) : (
        <></>
      )}

      {showTransactionSearch && (
        <TransactionSearchModal
          show
          initialValue={queryParams.transactionHash}
          onHide={() => setShowTransactionSearch(false)}
          onSearch={(transactionHash) => {
            updateQueryParams({ transactionHash });
            setShowTransactionSearch(false);
          }}
        />
      )}
    </div>
  );
}
