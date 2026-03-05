import { Spinner } from "@/components/dotLoader/DotLoader";
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

export default function UserPageHeaderStatsTDHConsensus({
  profile,
}: {
  readonly profile: ApiIdentity;
}) {
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
    <Link href="/core/tdh-calculation" className="tw-no-underline">
      <div className="tw-flex tw-transform-gpu tw-items-center tw-justify-between tw-gap-y-3 tw-rounded-lg tw-border tw-border-solid tw-border-iron-800 tw-bg-iron-950 tw-p-5 tw-transition tw-duration-300 tw-ease-out desktop-hover:hover:tw-scale-[1.01] desktop-hover:hover:tw-border-iron-700 desktop-hover:hover:tw-bg-iron-900 desktop-hover:hover:tw-text-white">
        <span className="font-lighter">TDH Consensus</span>
        <span className="font-bolder tw-flex tw-items-center tw-gap-x-3">
          {fetchingTdhConsensus ? (
            <>
              <Spinner dimension={30} /> Fetching
            </>
          ) : (
            <>
              <>
                {tdhConsensusInfo?.boosted_tdh
                  ? formatNumberWithCommas(tdhConsensusInfo?.boosted_tdh)
                  : 0}{" "}
                TDH
              </>
              {concensusIcon && (
                <FontAwesomeIcon
                  icon={concensusIcon}
                  color={concensusColor}
                  size="lg"
                />
              )}
            </>
          )}
        </span>
      </div>
    </Link>
  );
}
