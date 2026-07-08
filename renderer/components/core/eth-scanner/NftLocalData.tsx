"use client";

import DotLoader from "@/components/dotLoader/DotLoader";
import {
  GRADIENT_CONTRACT,
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
  NEXTGEN_CONTRACT,
} from "@/constants/constants";
import { ImageScale, getScaledImageUri } from "@/helpers/image.helpers";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { formatDate, formatInteger } from "@/i18n/format";
import type { SupportedLocale } from "@/i18n/locales";
import { t } from "@/i18n/messages";
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

interface PaginatedNftsResponseLocal extends PaginatedResponseLocal<LocalNft> {
  readonly seasonOptions: number[];
}

interface RenderableLocalNft extends Omit<LocalNft, "mint_date"> {
  readonly mint_date: Date | null;
}

interface RenderablePaginatedNftsResponseLocal extends PaginatedResponseLocal<RenderableLocalNft> {
  readonly seasonOptions: number[];
}

const CONTRACT_OPTIONS = [
  { labelKey: "core.ethScanner.nftsData.contracts.all", value: "" },
  {
    labelKey: "core.ethScanner.nftsData.contracts.memes",
    value: MEMES_CONTRACT,
  },
  {
    labelKey: "core.ethScanner.nftsData.contracts.gradient",
    value: GRADIENT_CONTRACT,
  },
  {
    labelKey: "core.ethScanner.nftsData.contracts.nextgen",
    value: NEXTGEN_CONTRACT,
  },
  {
    labelKey: "core.ethScanner.nftsData.contracts.memelab",
    value: MEMELAB_CONTRACT,
  },
] as const;

const initialQueryParams = {
  contractAddress: "",
  search: "",
  season: "",
  page: 1,
  limit: 10,
};

const normalizeAddress = (address: string): string => address.toLowerCase();

const isContract = (contract: string, target: string): boolean =>
  normalizeAddress(contract) === normalizeAddress(target);

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime());

const dateFromEpoch = (value: number): Date => {
  const epochMilliseconds =
    Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
  return new Date(epochMilliseconds);
};

const parseMintDate = (mintDate: LocalNft["mint_date"]): Date | null => {
  if (mintDate instanceof Date) {
    return isValidDate(mintDate) ? mintDate : null;
  }

  if (typeof mintDate === "number") {
    const date = dateFromEpoch(mintDate);
    return isValidDate(date) ? date : null;
  }

  const trimmedMintDate = mintDate.trim();
  if (!trimmedMintDate) {
    return null;
  }

  const numericMintDate = Number(trimmedMintDate);
  const date = Number.isFinite(numericMintDate)
    ? dateFromEpoch(numericMintDate)
    : new Date(trimmedMintDate);

  return isValidDate(date) ? date : null;
};

const getNftDisplayLabel = (
  nft: LocalNft | RenderableLocalNft,
  locale: SupportedLocale
): string => {
  if (isContract(nft.contract, MEMES_CONTRACT)) {
    return t(locale, "core.ethScanner.nftsData.display.memes", {
      tokenId: formatInteger(locale, nft.id),
    });
  }
  if (isContract(nft.contract, GRADIENT_CONTRACT)) {
    return t(locale, "core.ethScanner.nftsData.display.gradient", {
      tokenId: formatInteger(locale, nft.id),
    });
  }
  if (isContract(nft.contract, MEMELAB_CONTRACT)) {
    return t(locale, "core.ethScanner.nftsData.display.memelab", {
      tokenId: formatInteger(locale, nft.id),
    });
  }
  if (isContract(nft.contract, NEXTGEN_CONTRACT)) {
    const normalized = normalizeNextgenTokenID(nft.id);
    return t(locale, "core.ethScanner.nftsData.display.nextgen", {
      collectionId: formatInteger(locale, normalized.collection_id),
      tokenId: formatInteger(locale, normalized.token_id),
    });
  }
  return t(locale, "core.ethScanner.nftsData.display.unknown", {
    tokenId: formatInteger(locale, nft.id),
  });
};

const getNftPath = (nft: LocalNft | RenderableLocalNft): string => {
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

const getSupplyDisplay = (
  nft: LocalNft | RenderableLocalNft,
  locale: SupportedLocale
): string => {
  const minted = formatInteger(locale, nft.edition_size);
  if (!nft.burns) {
    return t(locale, "core.ethScanner.nftsData.supply.minted", { minted });
  }
  return t(locale, "core.ethScanner.nftsData.supply.mintedBurned", {
    minted,
    burned: formatInteger(locale, nft.burns),
  });
};

const getSeasonDisplay = (
  nft: LocalNft | RenderableLocalNft,
  locale: SupportedLocale
): string => {
  const season = Number(nft.season);
  if (!Number.isInteger(season) || season < 0) {
    return "-";
  }
  return t(locale, "core.ethScanner.nftsData.season.value", {
    season: formatInteger(locale, season),
  });
};

const toRenderableNft = (nft: LocalNft): RenderableLocalNft => ({
  ...nft,
  mint_date: parseMintDate(nft.mint_date),
});

export default function NftLocalData() {
  const locale = useBrowserLocale();
  const [nfts, setNfts] = useState<RenderablePaginatedNftsResponseLocal>();
  const [queryParams, setQueryParams] = useState(initialQueryParams);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);

  const selectedTheMemes = isContract(
    queryParams.contractAddress,
    MEMES_CONTRACT
  );
  const showSeasonColumn =
    queryParams.contractAddress === "" || selectedTheMemes;

  const contractOptions = useMemo(
    () =>
      CONTRACT_OPTIONS.map((option) => ({
        ...option,
        label: t(locale, option.labelKey),
      })),
    [locale]
  );

  const fetchNfts = useCallback(() => {
    setIsLoading(true);
    const season = queryParams.season ? Number(queryParams.season) : undefined;
    window.localDb
      .getNfts(
        queryParams.page,
        queryParams.limit,
        queryParams.contractAddress,
        queryParams.search,
        Number.isInteger(season) ? season : undefined
      )
      .then((response: PaginatedNftsResponseLocal) => {
        setHasLoadError(false);
        setNfts({
          ...response,
          data: response.data.map(toRenderableNft),
        });
      })
      .catch(() => {
        setHasLoadError(true);
        setNfts(undefined);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [queryParams]);

  useEffect(() => {
    fetchNfts();
  }, [fetchNfts]);

  const clearFiltersEnabled = useMemo(
    () =>
      queryParams.contractAddress !== initialQueryParams.contractAddress ||
      queryParams.search !== initialQueryParams.search ||
      queryParams.season !== initialQueryParams.season ||
      queryParams.page !== initialQueryParams.page ||
      queryParams.limit !== initialQueryParams.limit,
    [queryParams]
  );

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
              {t(locale, "core.ethScanner.nftsData.filters.contract")}
            </span>
            <select
              value={queryParams.contractAddress}
              onChange={(e) => onContractChange(e.target.value)}
              className="tw-w-fit tw-rounded-xl tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
            >
              {contractOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tw-flex tw-flex-col tw-gap-1">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(locale, "core.ethScanner.nftsData.filters.search")}
            </span>
            <input
              type="search"
              value={queryParams.search}
              onChange={(e) =>
                updateQueryParams({ search: e.target.value.trimStart() })
              }
              className="tw-w-64 tw-rounded-xl tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
              placeholder={t(
                locale,
                "core.ethScanner.nftsData.filters.searchPlaceholder"
              )}
            />
          </label>

          {selectedTheMemes && (
            <label className="tw-flex tw-flex-col tw-gap-1">
              <span className="tw-text-sm tw-font-medium tw-text-iron-300">
                {t(locale, "core.ethScanner.nftsData.filters.season")}
              </span>
              <select
                value={queryParams.season}
                onChange={(e) => updateQueryParams({ season: e.target.value })}
                className="tw-w-fit tw-rounded-xl tw-border tw-border-gray-300 tw-bg-white tw-px-3 tw-py-2 tw-text-black"
              >
                <option value="">
                  {t(locale, "core.ethScanner.nftsData.seasons.all")}
                </option>
                {(nfts?.seasonOptions ?? []).map((season) => (
                  <option key={season} value={season}>
                    {t(locale, "core.ethScanner.nftsData.season.value", {
                      season: formatInteger(locale, season),
                    })}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="tw-flex tw-flex-col tw-gap-1">
            <span className="tw-text-sm tw-font-medium tw-text-iron-300">
              {t(locale, "core.ethScanner.nftsData.filters.pageSize")}
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
                aria-label={t(
                  locale,
                  "core.ethScanner.nftsData.actions.clearFilters"
                )}
                onClick={() => setQueryParams(initialQueryParams)}
                className="tw-inline-flex tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-iron-800 tw-p-2 tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-iron-700"
              >
                <FontAwesomeIcon
                  icon={faXmark}
                  className="tw-h-4 tw-w-4"
                  aria-hidden="true"
                />
              </button>
              <Tooltip
                id="clear-nft-filters-tooltip"
                style={{
                  backgroundColor: "#1F2937",
                  color: "white",
                  padding: "4px 8px",
                }}
                delayShow={150}
                openEvents={{ mouseenter: true, focus: true }}
                closeEvents={{ mouseleave: true, blur: true, click: true }}
              >
                {t(locale, "core.ethScanner.nftsData.actions.clearFilters")}
              </Tooltip>
            </>
          )}
        </div>
        <div className="tw-flex tw-items-center tw-gap-2">
          <button
            type="button"
            data-tooltip-id="refresh-nft-results-tooltip"
            aria-label={t(
              locale,
              "core.ethScanner.nftsData.actions.refreshResults"
            )}
            onClick={fetchNfts}
            className="tw-inline-flex tw-cursor-pointer tw-items-center tw-justify-center tw-rounded-lg tw-border-0 tw-bg-iron-800 tw-p-2 tw-text-iron-100 tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-iron-700"
          >
            <FontAwesomeIcon
              icon={faRefresh}
              className="tw-h-4 tw-w-4"
              aria-hidden="true"
            />
          </button>
          <Tooltip
            id="refresh-nft-results-tooltip"
            style={{
              backgroundColor: "#1F2937",
              color: "white",
              padding: "4px 8px",
            }}
            delayShow={150}
            openEvents={{ mouseenter: true, focus: true }}
            closeEvents={{ mouseleave: true, blur: true, click: true }}
          >
            {t(locale, "core.ethScanner.nftsData.actions.refreshResults")}
          </Tooltip>
        </div>
      </div>

      <div className="tw-mb-6 tw-flex tw-flex-wrap tw-items-center tw-gap-4">
        <div
          className="tw-text-xl tw-font-semibold"
          aria-live="polite"
          aria-busy={isLoading}
        >
          {t(locale, "core.ethScanner.nftsData.summary.total", {
            count: nfts ? formatInteger(locale, nfts.total) : "-",
          })}
          {isLoading && (
            <span className="tw-ml-2 tw-inline-flex tw-align-middle">
              <span className="tw-sr-only">
                {t(locale, "core.ethScanner.nftsData.summary.loading")}
              </span>
              <span aria-hidden="true">
                <DotLoader />
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="tw-overflow-x-auto">
        <table className="tw-w-full tw-table-auto tw-border-collapse">
          <caption className="tw-sr-only">
            {t(locale, "core.ethScanner.nftsData.table.caption")}
          </caption>
          <thead>
            <tr className="tw-border-b tw-border-iron-800 tw-text-left tw-text-xs tw-font-semibold tw-uppercase tw-tracking-normal tw-text-iron-400">
              <th className="tw-w-px tw-whitespace-nowrap tw-px-2 tw-py-2">
                {t(locale, "core.ethScanner.nftsData.table.image")}
              </th>
              <th className="tw-min-w-80 tw-px-2 tw-py-2">
                {t(locale, "core.ethScanner.nftsData.table.nft")}
              </th>
              <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">
                {t(locale, "core.ethScanner.nftsData.table.mintDate")}
              </th>
              {showSeasonColumn && (
                <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">
                  {t(locale, "core.ethScanner.nftsData.table.season")}
                </th>
              )}
              <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">
                {t(locale, "core.ethScanner.nftsData.table.tdh")}
              </th>
              <th className="tw-whitespace-nowrap tw-px-2 tw-py-2">
                {t(locale, "core.ethScanner.nftsData.table.supply")}
              </th>
              <th className="tw-w-px tw-whitespace-nowrap tw-px-2 tw-py-2">
                {t(locale, "core.ethScanner.nftsData.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="[&>tr:nth-child(even)]:tw-bg-transparent [&>tr:nth-child(odd)]:tw-bg-black [&>tr>td]:tw-p-2">
            {nfts?.data.length ? (
              nfts.data.map((nft) => {
                const displayLabel = getNftDisplayLabel(nft, locale);
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
                          alt={t(
                            locale,
                            "core.ethScanner.nftsData.artwork.alt",
                            { nft: displayLabel }
                          )}
                        />
                      ) : (
                        <div
                          role="img"
                          className="tw-h-12 tw-w-12 tw-rounded-md tw-bg-iron-800 tw-ring-1 tw-ring-white/20"
                          aria-label={t(
                            locale,
                            "core.ethScanner.nftsData.artwork.unavailable",
                            { nft: displayLabel }
                          )}
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
                      {nft.mint_date ? (
                        <time dateTime={nft.mint_date.toISOString()}>
                          {formatDate(locale, nft.mint_date)}
                        </time>
                      ) : (
                        formatDate(locale, null)
                      )}
                    </td>
                    {showSeasonColumn && (
                      <td className="tw-whitespace-nowrap tw-text-iron-200">
                        {isContract(nft.contract, MEMES_CONTRACT)
                          ? getSeasonDisplay(nft, locale)
                          : "-"}
                      </td>
                    )}
                    <td className="tw-whitespace-nowrap tw-text-iron-200">
                      {formatInteger(locale, nft.tdh)}
                    </td>
                    <td className="tw-whitespace-nowrap tw-text-iron-200">
                      {getSupplyDisplay(nft, locale)}
                    </td>
                    <td className="tw-whitespace-nowrap tw-text-right">
                      <Link
                        href={href}
                        aria-label={t(
                          locale,
                          "core.ethScanner.nftsData.actions.open",
                          { nft: displayLabel }
                        )}
                        title={t(
                          locale,
                          "core.ethScanner.nftsData.actions.open",
                          { nft: displayLabel }
                        )}
                        className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-lg tw-p-2 tw-text-iron-100 tw-transition-colors hover:tw-bg-iron-800 hover:tw-text-white focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400"
                      >
                        <FontAwesomeIcon
                          icon={faExternalLinkSquare}
                          className="tw-h-4 tw-w-4"
                          aria-hidden="true"
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
                  {isLoading ? (
                    <>
                      <span className="tw-sr-only">
                        {t(locale, "core.ethScanner.nftsData.summary.loading")}
                      </span>
                      <span aria-hidden="true">
                        <DotLoader />
                      </span>
                    </>
                  ) : hasLoadError ? (
                    t(locale, "core.ethScanner.nftsData.error.fetch")
                  ) : (
                    t(locale, "core.ethScanner.nftsData.empty")
                  )}
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
