"use client";

import { ConsolidatedTDH } from "@/entities/ITDH";
import { ApiIdentity } from "@/generated/models/ApiIdentity";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faCheckCircle,
  faMinusCircle,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";
import UserStatsRow from "../../utils/stats/UserStatsRow";

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
    <div className="tw-mt-3">
      <UserStatsRow
        handle={routeHandle}
        tdh={profile.tdh}
        tdh_rate={profile.tdh_rate}
        xtdh={profile.xtdh}
        xtdh_rate={profile.xtdh_rate}
        rep={profile.rep}
        cic={profile.cic}
        followersCount={followersCount}
      />
    </div>
  );
}
