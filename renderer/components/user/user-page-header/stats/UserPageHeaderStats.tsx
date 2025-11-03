"use client";

import CircleLoader, {
  CircleLoaderSize,
} from "@/components/distribution-plan-tool/common/CircleLoader";
import { ConsolidatedTDH } from "@/entities/ITDH";
import { ApiIdentity } from "@/generated/models/ApiIdentity";
import { formatNumberWithCommas } from "@/helpers/Helpers";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faCheckCircle,
  faMinusCircle,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Tooltip } from "react-tooltip";
import UserPageFollowers from "../followers/UserPageFollowers";

const SAFE_ROUTE_SEGMENT_PATTERN = /^[a-zA-Z0-9._-]+$/;

function sanitizeRouteSegment(value: string): string | null {
  if (!value) {
    return null;
  }
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }
  const normalizedValue = trimmedValue.toLowerCase();
  if (!SAFE_ROUTE_SEGMENT_PATTERN.test(normalizedValue)) {
    return null;
  }
  return encodeURIComponent(normalizedValue);
}

export default function UserPageHeaderStats({
  profile,
  handleOrWallet,
  followersCount,
}: {
  readonly profile: ApiIdentity;
  readonly handleOrWallet: string;
  readonly followersCount: number | null;
}) {
  const routeHandle = sanitizeRouteSegment(handleOrWallet);

  const [fetchingTdhConsensus, setFetchingTdhConsensus] = useState(false);
  const [tdhConsensusInfo, setTdhConsensusInfo] = useState<ConsolidatedTDH>();
  const [concensusIcon, setConcensusIcon] = useState<IconProp>();
  const [concensusColor, setConcensusColor] = useState<string>();

  useEffect(() => {
    if (!profile.consolidation_key) {
      setTdhConsensusInfo(undefined);
      return;
    }

    setFetchingTdhConsensus(true);
    window.localDb
      .getTdhInfoForKey(profile.consolidation_key)
      .then((tdhInfo: ConsolidatedTDH) => {
        setTdhConsensusInfo(tdhInfo);
      })
      .finally(() => {
        setFetchingTdhConsensus(false);
      });
  }, [profile]);

  useEffect(() => {
    if (!tdhConsensusInfo && profile.tdh > 0) {
      setConcensusIcon(faMinusCircle);
      setConcensusColor("orange");
    } else if (profile.tdh && profile.tdh !== tdhConsensusInfo?.boosted_tdh) {
      setConcensusIcon(faTimesCircle);
      setConcensusColor("red");
    } else {
      setConcensusIcon(faCheckCircle);
      setConcensusColor("green");
    }
  }, [profile, tdhConsensusInfo]);

  if (!routeHandle) {
    return null;
  }

  return (
    <div className="tw-mt-3 tw-flex tw-items-center tw-justify-between tw-gap-x-4">
      <div className="tw-flex tw-gap-x-4 sm:tw-gap-x-6 tw-flex-wrap tw-gap-y-2">
        <Link
          href={`/${routeHandle}/collected`}
          className="tw-no-underline tw-inline-flex tw-items-center tw-gap-x-1 desktop-hover:hover:tw-underline tw-transition tw-duration-300 tw-ease-out">
          <span className="tw-text-base tw-font-medium tw-text-iron-50">
            {formatNumberWithCommas(profile.tdh)}
          </span>
          <span className="tw-block tw-text-base tw-font-medium tw-text-iron-400">
            TDH
          </span>
        </Link>
        <Link
          href={`/${routeHandle}/stats?activity=tdh-history`}
          className="tw-no-underline tw-inline-flex tw-items-center tw-gap-x-1 desktop-hover:hover:tw-underline tw-transition tw-duration-300 tw-ease-out"
          data-tooltip-id="tdh-rate-tooltip">
          <span className="tw-text-base tw-font-medium tw-text-iron-50">
            {formatNumberWithCommas(profile.tdh_rate)}
          </span>
          <span className="tw-block tw-text-base tw-font-medium tw-text-iron-400 tw-whitespace-nowrap">
            TDH Rate
          </span>
        </Link>
        <Link
          href={`/${routeHandle}/rep`}
          className="tw-no-underline tw-inline-flex tw-items-center tw-gap-x-1 desktop-hover:hover:tw-underline tw-transition tw-duration-300 tw-ease-out">
          <span className="tw-text-base tw-font-medium tw-text-iron-50">
            {formatNumberWithCommas(profile.rep)}
          </span>
          <span className="tw-block tw-text-base tw-font-medium tw-text-iron-400">
            Rep
          </span>
        </Link>
        <UserPageFollowers
          handleOrWallet={routeHandle}
          followersCount={followersCount}
        />
      </div>
      <Tooltip
        id="tdh-rate-tooltip"
        place="top"
        style={{
          backgroundColor: "#1F2937",
          color: "white",
          padding: "4px 8px",
        }}>
        <span className="tw-text-xs">How much TDH you earn each day</span>
      </Tooltip>
      <Link href="/core/tdh-calculation" className="tw-no-underline">
        <div className="tw-mt-2 seize-card-white seize-card-white-clickable tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-y-3">
          <span className="font-lighter">TDH Consensus</span>
          <span className="font-bolder tw-flex tw-items-center tw-gap-x-3">
            {fetchingTdhConsensus ? (
              <>
                <CircleLoader size={CircleLoaderSize.SMALL} /> Fetching
              </>
            ) : (
              <>
                {concensusIcon && (
                  <FontAwesomeIcon
                    icon={concensusIcon}
                    color={concensusColor}
                    height={30}
                  />
                )}
                {tdhConsensusInfo?.boosted_tdh
                  ? formatNumberWithCommas(tdhConsensusInfo?.boosted_tdh)
                  : 0}{" "}
                TDH
              </>
            )}
          </span>
        </div>
      </Link>
    </div>
  );
}
