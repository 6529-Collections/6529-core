import Link from "next/link";
import { ApiIdentity } from "../../../../generated/models/ApiIdentity";
import { formatNumberWithCommas } from "../../../../helpers/Helpers";
import { useRouter } from "next/router";
import UserPageFollowers from "../followers/UserPageFollowers";
import { useEffect, useState } from "react";
import {
  faCheckCircle,
  faMinusCircle,
  faTimesCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { ConsolidatedTDH } from "../../../../entities/ITDH";
import { Spinner } from "../../../dotLoader/DotLoader";

export default function UserPageHeaderStats({
  profile,
}: {
  readonly profile: ApiIdentity;
}) {
  const router = useRouter();
  const user = router.query.user as string;

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
    <div className="tw-mt-3 tw-flex tw-items-center tw-justify-between">
      <div className="tw-flex tw-gap-x-6">
        <Link
          href={`/${user}/collected`}
          className="tw-no-underline tw-inline-flex tw-items-center tw-gap-x-1">
          <span className="tw-text-base tw-font-medium tw-text-iron-50">
            {formatNumberWithCommas(profile.tdh)}
          </span>
          <span className="tw-block tw-text-base tw-font-medium tw-text-iron-400">
            TDH
          </span>
        </Link>
        <Link
          href={`/${user}/rep`}
          className="tw-no-underline tw-inline-flex tw-items-center tw-gap-x-1">
          <span className="tw-text-base tw-font-medium tw-text-iron-50">
            {formatNumberWithCommas(profile.rep)}
          </span>
          <span className="tw-block tw-text-base tw-font-medium tw-text-iron-400">
            Rep
          </span>
        </Link>
        <UserPageFollowers profile={profile} />
      </div>
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
