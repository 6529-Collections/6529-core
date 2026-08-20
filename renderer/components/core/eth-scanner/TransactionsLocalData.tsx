"use client";

import {
  GRADIENT_CONTRACT,
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
  NEXTGEN_CONTRACT,
} from "@/constants/constants";
import { Transaction } from "@/entities/ITransaction";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { formatInteger } from "@/i18n/format";
import { t } from "@/i18n/messages";
import { PaginatedResponseLocal } from "@/shared/types";
import {
  faChevronDown,
  faChevronUp,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tooltip } from "react-tooltip";
import DotLoader from "../../dotLoader/DotLoader";
import LatestActivityRow from "../../latest-activity/LatestActivityRow";
import Pagination from "../../pagination/Pagination";

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

  const [isLoading, setIsLoading] = useState(false);

  const fetchTransactions = useCallback(() => {
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
        transactions.data.forEach((t: Transaction) => {
          t.transaction_date = new Date(
            Number((t.transaction_date as any) * 1000)
          );
        });
        setTransactions(transactions);
      })
      .finally(() => {
        setIsLoading(false);
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
          <label className="tw-flex tw-flex-col tw-gap-2">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(
                locale,
                "core.ethScanner.transactionsData.filters.transactionHash"
              )}
            </span>
            <input
              type="search"
              value={queryParams.transactionHash}
              onChange={(e) =>
                updateQueryParams({
                  transactionHash: e.target.value.trimStart(),
                })
              }
              className="tw-h-10 tw-w-72 tw-rounded-lg tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
              placeholder={t(
                locale,
                "core.ethScanner.transactionsData.filters.transactionHashPlaceholder"
              )}
            />
          </label>

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
          {t(locale, "core.ethScanner.transactionsData.summary.total", {
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
    </div>
  );
}
