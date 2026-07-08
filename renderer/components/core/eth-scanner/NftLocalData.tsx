"use client";

import DotLoader from "@/components/dotLoader/DotLoader";
import {
  GRADIENT_CONTRACT,
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
  NEXTGEN_CONTRACT,
} from "@/constants/constants";
import { ImageScale, getScaledImageUri } from "@/helpers/image.helpers";
import type { PaginatedResponseLocal } from "@/shared/types";
import {
  faExternalLinkSquare,
  faRefresh,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Tooltip } from "react-tooltip";
import { normalizeNextgenTokenID } from "../../nextGen/nextgen_helpers";
import Pagination from "../../pagination/Pagination";

interface LocalNft {
  readonly id: number;
  readonly contract: string;
  readonly uri: string;
  readonly mint_date: Date | number | string;
  readonly season?: number | null | undefined;
  readonly edition_size: number;
  readonly burns: number;
  readonly name: string;
  readonly image_url: string;
  readonly tdh: number;
}

interface PaginatedNftsResponseLocal
  extends PaginatedResponseLocal<LocalNft> {
  readonly seasonOptions: number[];
}

const CONTRACT_OPTIONS = [
  { label: "All Collections", value: "" },
  { label: "The Memes", value: MEMES_CONTRACT },
  { label: "6529 Gradient", value: GRADIENT_CONTRACT },
  { label: "NextGen", value: NEXTGEN_CONTRACT },
  { label: "Meme Lab", value: MEMELAB_CONTRACT },
];

const initialQueryParams = {
  contractAddress: "",
  search: "",
  season: "",
  page: 1,
  limit: 10,
};

const numberFormatter = new Intl.NumberFormat(undefined);
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const normalizeAddress = (address: string): string => address.toLowerCase();

const isContract = (contract: string, target: string): boolean =>
  normalizeAddress(contract) === normalizeAddress(target);

const getMintDate = (mintDate: LocalNft["mint_date"]): Date => {
  if (mintDate instanceof Date) {
    return mintDate;
  }
  return new Date(Number(mintDate) * 1000);
};

const formatNumber = (value: number | null | undefined): string =>
  numberFormatter.format(value ?? 0);

const getNftDisplayLabel = (nft: LocalNft): string => {
  if (isContract(nft.contract, MEMES_CONTRACT)) {
    return `The Memes #${nft.id}`;
  }
  if (isContract(nft.contract, GRADIENT_CONTRACT)) {
    return `6529 Gradient #${nft.id}`;
  }
  if (isContract(nft.contract, MEMELAB_CONTRACT)) {
    return `Meme Lab #${nft.id}`;
  }
  if (isContract(nft.contract, NEXTGEN_CONTRACT)) {
    const normalized = normalizeNextgenTokenID(nft.id);
    return `NextGen C${normalized.collection_id} #${normalized.token_id}`;
  }
  return `NFT #${nft.id}`;
};

const getNftPath = (nft: LocalNft): string => {
  if (isContract(nft.contract, MEMES_CONTRACT)) {
    return `/the-memes/${nft.id}`;
  }
  if (isContract(nft.contract, GRADIENT_CONTRACT)) {
    return `/6529-gradient/${nft.id}`;
  }
  if (isContract(nft.contract, MEMELAB_CONTRACT)) {
    return `/meme-lab/${nft.id}`;
  }
  if (isContract(nft.contract, NEXTGEN_CONTRACT)) {
    return `/nextgen/token/${nft.id}`;
  }
  return "#";
};

const getSupplyDisplay = (nft: LocalNft): string => {
  const minted = `${formatNumber(nft.edition_size)} minted`;
  if (!nft.burns) {
    return minted;
  }
  return `${minted} / ${formatNumber(nft.burns)} burned`;
};

const getSeasonDisplay = (nft: LocalNft): string => {
  const season = Number(nft.season);
  if (!Number.isInteger(season) || season < 0) {
    return "-";
  }
  return `SZN ${season}`;
};

const toRenderableNft = (nft: LocalNft): LocalNft => ({
  ...nft,
  mint_date: getMintDate(nft.mint_date),
});

export default function NftLocalData() {
  const [nfts, setNfts] = useState<PaginatedNftsResponseLocal>();
  const [queryParams, setQueryParams] = useState(initialQueryParams);
  const [isLoading, setIsLoading] = useState(false);

  const selectedTheMemes = isContract(
    queryParams.contractAddress,
    MEMES_CONTRACT
  );
  const showSeasonColumn =
    queryParams.contractAddress === "" || selectedTheMemes;

  const selectedSeason = queryParams.season
    ? Number(queryParams.season)
    : undefined;

  const fetchNfts = useCallback(() => {
    setIsLoading(true);
    window.localDb
      .getNfts(
        queryParams.page,
        queryParams.limit,
        queryParams.contractAddress,
        queryParams.search,
        selectedSeason
      )
      .then((response: PaginatedNftsResponseLocal) => {
        setNfts({
          ...response,
          data: response.data.map(toRenderableNft),
        });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [queryParams, selectedSeason]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  const clearFiltersEnabled = useMemo(
    () => JSON.stringify(queryParams) !== JSON.stringify(initialQueryParams),
    [queryParams]
  );

  const updateQueryParams = (
    updates: Partial<typeof queryParams>,
    resetPage = true
  ) => {
    setQueryParams((prev) => ({
      ...prev,
      ...updates,
      page: resetPage ? 1 : updates.page ?? prev.page,
    }));
  };

  const onContractChange = (contractAddress: string) => {
    updateQueryParams({
      contractAddress,
      season: isContract(contractAddress, MEMES_CONTRACT)
        ? queryParams.season
        : "",
    });
  };

  return (
    <div className="tw-mt-4">
      <div className="tw-mb-6 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-4">
        <div className="tw-flex tw-flex-wrap tw-items-end tw-gap-4">
          <label className="tw-flex tw-flex-col tw-gap-1">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              Contract
            </span>
            <select
              value={queryParams.contractAddress}
              onChange={(e) => onContractChange(e.target.value)}
              className="tw-w-fit tw-rounded-xl tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
            >
              {CONTRACT_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tw-flex tw-flex-col tw-gap-1">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              Search
            </span>
            <input
              type="search"
              value={queryParams.search}
              onChange={(e) =>
                updateQueryParams({ search: e.target.value.trimStart() })
              }
              className="tw-w-64 tw-rounded-xl tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
              placeholder="Name or token id"
            />
          </label>

          {selectedTheMemes && (
            <label className="tw-flex tw-flex-col tw-gap-1">
              <span className="tw-text-sm tw-font-medium tw-text-iron-300">
                Season
              </span>
              <select
                value={queryParams.season}
                onChange={(e) => updateQueryParams({ season: e.target.value })}
                className="tw-w-fit tw-rounded-xl tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
              >
                <option value="">All Seasons</option>
                {(nfts?.seasonOptions ?? []).map((season) => (
                  <option key={season} value={season}>
                    SZN {season}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="tw-flex tw-flex-col tw-gap-1">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              Page Size
            </span>
            <select
              value={queryParams.limit}
              onChange={(e) =>
                updateQueryParams({ limit: Number(e.target.value) })
              }
              className="tw-w-fit tw-rounded-xl tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>

          {clearFiltersEnabled && (
            <>
              <button
                type="button"
                data-tooltip-id="clear-nft-filters-tooltip"
                aria-label="Clear NFT filters"
                onClick={() => setQueryParams(initialQueryParams)}
                className="tw-inline-flex tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-iron-800 tw-p-2 tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-iron-700"
              >
                <FontAwesomeIcon icon={faXmark} className="tw-h-4 tw-w-4" />
              </button>
              <Tooltip
                id="clear-nft-filters-tooltip"
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
          <button
            type="button"
            data-tooltip-id="refresh-nft-results-tooltip"
            aria-label="Refresh NFT results"
            onClick={fetchNfts}
            className="tw-inline-flex tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-iron-800 tw-p-2 tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-iron-700"
          >
            <FontAwesomeIcon icon={faRefresh} className="tw-h-4 tw-w-4" />
          </button>
          <Tooltip
            id="refresh-nft-results-tooltip"
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
          Total NFTs: {isLoading ? <DotLoader /> : formatNumber(nfts?.total)}
        </div>
      </div>

      <div className="tw-overflow-x-auto">
        <table className="tw-w-full tw-table-auto tw-border-collapse">
          <thead>
            <tr className="tw-border-b tw-border-iron-800 tw-text-left tw-text-xs tw-font-semibold tw-uppercase tw-tracking-normal tw-text-iron-400">
              <th className="tw-w-px tw-whitespace-nowrap tw-px-2 tw-py-2">
                Image
              </th>
              <th className="tw-min-w-80 tw-px-2 tw-py-2">NFT</th>
              <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">
                Mint Date
              </th>
              {showSeasonColumn && (
                <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">
                  Season
                </th>
              )}
              <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">TDH</th>
              <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">Supply</th>
              <th className="tw-w-px tw-whitespace-nowrap tw-px-2 tw-py-2">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(odd)]:tw-bg-black [&>tr:nth-child(even)]:tw-bg-transparent [&>tr>td]:tw-p-2">
            {nfts?.data.length ? (
              nfts.data.map((nft) => {
                const displayLabel = getNftDisplayLabel(nft);
                const href = getNftPath(nft);
                const imageSrc = nft.image_url
                  ? getScaledImageUri(nft.image_url, ImageScale.W_AUTO_H_50)
                  : "";

                return (
                  <tr
                    key={`${nft.contract}-${nft.id}`}
                    className="tw-leading-6"
                  >
                    <td className="tw-whitespace-nowrap">
                      {imageSrc ? (
                        <img
                          className="tw-h-12 tw-w-12 tw-rounded-md tw-bg-iron-800 tw-object-cover tw-ring-1 tw-ring-white/20"
                          src={imageSrc}
                          alt={`${displayLabel} artwork`}
                        />
                      ) : (
                        <div
                          role="img"
                          className="tw-h-12 tw-w-12 tw-rounded-md tw-bg-iron-800 tw-ring-1 tw-ring-white/20"
                          aria-label={`${displayLabel} artwork unavailable`}
                        />
                      )}
                    </td>
                    <td className="tw-min-w-80">
                      <div className="tw-flex tw-flex-col tw-gap-0.5">
                        <Link
                          href={href}
                          className="tw-w-fit tw-font-semibold tw-text-iron-100 tw-underline tw-transition-colors hover:tw-text-iron-300 focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400"
                        >
                          {displayLabel}
                        </Link>
                        <span className="tw-max-w-xl tw-truncate tw-text-sm tw-text-iron-300">
                          {nft.name}
                        </span>
                      </div>
                    </td>
                    <td className="tw-whitespace-nowrap tw-text-iron-200">
                      {dateFormatter.format(getMintDate(nft.mint_date))}
                    </td>
                    {showSeasonColumn && (
                      <td className="tw-whitespace-nowrap tw-text-iron-200">
                        {isContract(nft.contract, MEMES_CONTRACT)
                          ? getSeasonDisplay(nft)
                          : "-"}
                      </td>
                    )}
                    <td className="tw-whitespace-nowrap tw-text-iron-200">
                      {formatNumber(nft.tdh)}
                    </td>
                    <td className="tw-whitespace-nowrap tw-text-iron-200">
                      {getSupplyDisplay(nft)}
                    </td>
                    <td className="tw-whitespace-nowrap tw-text-right">
                      <Link
                        href={href}
                        aria-label={`Open ${displayLabel}`}
                        title={`Open ${displayLabel}`}
                        className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-lg tw-p-2 tw-text-iron-100 tw-transition-colors hover:tw-bg-iron-800 hover:tw-text-white focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400"
                      >
                        <FontAwesomeIcon
                          icon={faExternalLinkSquare}
                          className="tw-h-4 tw-w-4"
                        />
                      </Link>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={showSeasonColumn ? 7 : 6}
                  className="tw-py-6 tw-text-center tw-text-iron-400"
                >
                  {isLoading ? <DotLoader /> : "No NFTs found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {nfts?.total && nfts.total > queryParams.limit ? (
        <div className="tw-mt-4 tw-text-center">
          <Pagination
            page={queryParams.page}
            pageSize={queryParams.limit}
            totalResults={nfts.total}
            setPage={(newPage: number) => {
              updateQueryParams({ page: newPage }, false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
