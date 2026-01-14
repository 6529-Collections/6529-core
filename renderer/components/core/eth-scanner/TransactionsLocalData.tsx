"use client";

import {
  GRADIENT_CONTRACT,
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
  NEXTGEN_CONTRACT,
} from "@/constants/constants";
import { Transaction } from "@/entities/ITransaction";
import { PaginatedResponseLocal } from "@/shared/types";
import { faRefresh, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { Button, Table } from "react-bootstrap";
import { Tooltip } from "react-tooltip";
import DotLoader from "../../dotLoader/DotLoader";
import LatestActivityRow from "../../latest-activity/LatestActivityRow";
import Pagination from "../../pagination/Pagination";
import styles from "./ETHScanner.module.scss";

const initialQueryParams = {
  contractAddress: "",
  startDate: undefined as string | undefined,
  endDate: undefined as string | undefined,
  page: 1,
  limit: 10,
};

export default function TransactionsLocalData() {
  const [transactions, setTransactions] =
    useState<PaginatedResponseLocal<Transaction>>();
  const [queryParams, setQueryParams] = useState(initialQueryParams);

  const [isLoading, setIsLoading] = useState(false);

  const fetchTransactions = () => {
    setIsLoading(true);
    const { startDate, endDate, page, limit, contractAddress } = queryParams;

    window.localDb
      .getTransactions(
        Number((Number(startDate) / 1000).toFixed(0)),
        Number((Number(endDate) / 1000).toFixed(0)),
        page,
        limit,
        contractAddress
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
  };

  useEffect(() => {
    fetchTransactions();
  }, [queryParams]);

  const updateQueryParams = (key: keyof typeof queryParams, value: any) => {
    setQueryParams((prev) => ({ ...prev, [key]: value }));
  };

  const clearFiltersEnabled =
    JSON.stringify(queryParams) !== JSON.stringify(initialQueryParams);

  return (
    <div className="tw-mt-6 tw-p-4">
      <div className="tw-mb-6 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-4">
        <div className="tw-flex tw-flex-wrap tw-items-center tw-gap-4">
          <div className="tw-flex tw-items-center tw-gap-2">
            <span>Start Date:</span>
            <input
              type="date"
              value={
                queryParams.startDate
                  ? new Date(Number(queryParams.startDate) + 86400000)
                      .toISOString()
                      .split("T")[0]
                  : undefined
              }
              onChange={(e) =>
                updateQueryParams(
                  "startDate",
                  e.target.value
                    ? new Date(new Date(e.target.value).setHours(0, 0, 0, 0))
                        .getTime()
                        .toString()
                    : undefined
                )
              }
              className="tw-w-fit tw-rounded tw-border tw-border-gray-300 tw-px-3 tw-py-2 tw-text-black"
              placeholder="Start Date"
            />
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <span>End Date:</span>
            <input
              type="date"
              value={
                queryParams.endDate
                  ? new Date(Number(queryParams.endDate))
                      .toISOString()
                      .split("T")[0]
                  : undefined
              }
              onChange={(e) =>
                updateQueryParams(
                  "endDate",
                  e.target.value
                    ? new Date(
                        new Date(e.target.value).setHours(23, 59, 59, 999)
                      )
                        .getTime()
                        .toString()
                    : undefined
                )
              }
              className="tw-w-fit tw-rounded tw-border tw-border-gray-300 tw-px-3 tw-py-2 tw-text-black"
              placeholder="End Date"
            />
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <span>Page Size:</span>
            <select
              value={queryParams.limit}
              onChange={(e) =>
                updateQueryParams("limit", Number(e.target.value))
              }
              className="tw-w-fit tw-rounded tw-border tw-border-gray-300 tw-px-3 tw-py-2 tw-text-black"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <div className="tw-flex tw-items-center tw-gap-2">
            <select
              value={queryParams.contractAddress}
              onChange={(e) =>
                updateQueryParams("contractAddress", e.target.value)
              }
              className="tw-w-fit tw-rounded tw-border tw-border-gray-300 tw-px-3 tw-py-2 tw-text-black"
            >
              <option value={""}>All Contracts</option>
              <option value={MEMES_CONTRACT}>The Memes</option>
              <option value={GRADIENT_CONTRACT}>6529 Gradient</option>
              <option value={NEXTGEN_CONTRACT}>NextGen</option>
              <option value={MEMELAB_CONTRACT}>Meme Lab</option>
            </select>
          </div>
          {clearFiltersEnabled && (
            <>
              <Button
                variant="light"
                data-tooltip-id="clear-filters-tooltip"
                onClick={() => {
                  setQueryParams(initialQueryParams);
                }}
              >
                <FontAwesomeIcon icon={faXmark} className="tw-h-4 tw-w-4" />
              </Button>
              <Tooltip
                id="clear-filters-tooltip"
                style={{
                  backgroundColor: "#1F2937",
                  color: "white",
                  padding: "4px 8px",
                }}
              >
                Clear Filters
              </Tooltip>
            </>
          )}
        </div>
        <div className="tw-flex tw-items-center tw-gap-2">
          <Button
            variant="light"
            data-tooltip-id="refresh-results-tooltip"
            onClick={fetchTransactions}
          >
            <FontAwesomeIcon icon={faRefresh} className="tw-h-4 tw-w-4" />
          </Button>
          <Tooltip
            id="refresh-results-tooltip"
            style={{
              backgroundColor: "#1F2937",
              color: "white",
              padding: "4px 8px",
            }}
          >
            Refresh Results
          </Tooltip>
        </div>
      </div>

      <div className="tw-mb-6 tw-flex tw-flex-wrap tw-items-center tw-gap-4">
        <div className="tw-text-xl tw-font-semibold">
          Total Transactions:{" "}
          {isLoading ? <DotLoader /> : transactions?.total.toLocaleString()}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="tw-overflow-x-auto">
        <Table bordered={false} className={styles["transactionsTable"]}>
          <tbody>
            {transactions?.data.map((transaction) => (
              <LatestActivityRow
                tr={transaction}
                key={`${transaction.from_address}-${transaction.to_address}-${transaction.transaction}-${transaction.token_id}`}
              />
            ))}
          </tbody>
        </Table>
      </div>

      {transactions?.total && transactions?.total > queryParams.limit ? (
        <div className="text-center mt-4">
          <Pagination
            page={queryParams.page}
            pageSize={queryParams.limit}
            totalResults={transactions?.total}
            setPage={function (newPage: number) {
              updateQueryParams("page", newPage);
            }}
          />
        </div>
      ) : (
        <></>
      )}
    </div>
  );
}
