"use client";

import { Spinner } from "@/components/dotLoader/DotLoader";
import { ConsolidatedTDH } from "@/entities/ITDH";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faCheckCircle,
  faMinusCircle,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Tooltip } from "react-tooltip";
import { ApiIdentity } from "../../../../generated/models/ApiIdentity";
import { formatNumberWithCommas } from "../../../../helpers/Helpers";
import UserPageFollowers from "../followers/UserPageFollowers";

export default function UserPageHeaderStats({
  profile,
}: {
  readonly profile: ApiIdentity;
}) {
  const params = useParams();
  const user = params?.user?.toString();

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

  return (
    <div className="tw-mt-3">
      <div className="tw-flex tw-gap-x-4 sm:tw-gap-x-6 tw-flex-wrap tw-gap-y-2">
        <Link
          href={`/${user}/collected`}
          className="tw-no-underline tw-inline-flex tw-items-center tw-gap-x-1 desktop-hover:hover:tw-underline tw-transition tw-duration-300 tw-ease-out">
          <span className="tw-text-base tw-font-medium tw-text-iron-50">
            {formatNumberWithCommas(profile.tdh)}
          </span>
          <span className="tw-block tw-text-base tw-font-medium tw-text-iron-400">
            TDH
          </span>
        </Link>
        <Link
          href={`/${user}/stats?activity=tdh-history`}
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
          href={`/${user}/rep`}
          className="tw-no-underline tw-inline-flex tw-items-center tw-gap-x-1 desktop-hover:hover:tw-underline tw-transition tw-duration-300 tw-ease-out">
          <span className="tw-text-base tw-font-medium tw-text-iron-50">
            {formatNumberWithCommas(profile.rep)}
          </span>
          <span className="tw-block tw-text-base tw-font-medium tw-text-iron-400">
            Rep
          </span>
        </Link>
        <UserPageFollowers profile={profile} />
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
                <Spinner dimension={30} /> Fetching
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
