"use client";

import { publicEnv } from "@/config/env";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faCheckCircle,
  faCopy,
  faMinusCircle,
  faXmarkCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useState } from "react";
import { TDHInfo } from "../eth-scanner/Workers";

export default function TDHValidation({
  localInfo,
}: {
  localInfo: TDHInfo | undefined;
}) {
  const [isFetchingRemote, setIsFetchingRemote] = useState(true);
  const [remoteInfo, setRemoteInfo] = useState<{
    tdh: number;
    block: number;
    merkle_root: string;
  }>();

  const fetchRemote = () => {
    fetch(`${publicEnv.API_ENDPOINT}/oracle/tdh/total`)
      .then((res) => res.json())
      .then((data) => {
        setRemoteInfo(data);
        setIsFetchingRemote(false);
      });
  };

  useEffect(() => {
    fetchRemote();
  }, [localInfo]);

  function printStatusIcon(icon: IconProp, status: string) {
    return (
      <FontAwesomeIcon
        icon={icon}
        color={status}
        height={20}
        className="tw-mx-auto tw-block"
      />
    );
  }

  const tdhStatus = !remoteInfo ? "orange" : localInfo?.totalTDH === remoteInfo?.tdh ? "green" : "red";
  const tdhIcon =
    !remoteInfo ? faMinusCircle : localInfo?.totalTDH === remoteInfo?.tdh ? faCheckCircle : faXmarkCircle;
  const blockStatus = !remoteInfo ? "orange" : localInfo?.block === remoteInfo?.block ? "green" : "red";
  const blockIcon =
    !remoteInfo ? faMinusCircle : localInfo?.block === remoteInfo?.block ? faCheckCircle : faXmarkCircle;
  const merkleRootStatus = !remoteInfo
    ? "orange"
    : !remoteInfo?.merkle_root
      ? "orange"
      : localInfo?.merkleRoot === remoteInfo?.merkle_root
        ? "green"
        : "red";
  const merkleRootIcon = !remoteInfo
    ? faMinusCircle
    : !remoteInfo?.merkle_root
      ? faMinusCircle
      : localInfo?.merkleRoot === remoteInfo?.merkle_root
        ? faCheckCircle
        : faXmarkCircle;

  const remoteShimmer = (
    <span className="tw-inline-block tw-h-4 tw-w-16 tw-animate-pulse tw-rounded tw-bg-iron-800" />
  );

  return (
    <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-iron-800 tw-bg-iron-950 tw-p-5 tw-ring-1 tw-ring-inset tw-ring-iron-800 [&_table]:tw-w-full [&_table]:tw-table-fixed [&_tbody_tr]:tw-w-full [&_td:nth-child(1)]:tw-flex-[0_0_8rem] [&_td:nth-child(1)]:tw-whitespace-nowrap [&_td:nth-child(2)]:tw-flex-[2_1_0%] [&_td:nth-child(3)]:tw-flex-[2_1_0%] [&_td:nth-child(4)]:tw-flex-[0_0_5rem] [&_td:nth-child(5)]:tw-flex-1 [&_td]:tw-flex [&_td]:tw-min-h-[65px] [&_td]:tw-items-center [&_td]:tw-gap-2 [&_td]:tw-p-2 [&_th:nth-child(1)]:tw-flex-[0_0_8rem] [&_th:nth-child(1)]:tw-whitespace-nowrap [&_th:nth-child(2)]:tw-flex-[2_1_0%] [&_th:nth-child(3)]:tw-flex-[2_1_0%] [&_th:nth-child(4)]:tw-flex-[0_0_5rem] [&_th:nth-child(5)]:tw-flex-1 [&_th]:tw-flex [&_th]:tw-items-center [&_th]:tw-gap-2 [&_th]:tw-p-2 [&_th]:tw-text-left [&_thead_tr]:tw-border-b [&_thead_tr]:tw-border-iron-800 [&_tr]:tw-flex [&_tr]:tw-flex-row [&_tr]:tw-items-stretch">
      <table>
        <thead>
          <tr>
            <th>Value</th>
            <th>Your Node</th>
            <th>6529.io</th>
            <th className="tw-justify-center">Match</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <hr className="tw-my-2 tw-w-full tw-border-0 tw-border-t tw-border-iron-700" />
          <tr>
            <td>TDH</td>
            <td>
              {localInfo?.totalTDH?.toLocaleString()}{" "}
              {localInfo?.totalTDH && (
                <CopyIcon text={localInfo.totalTDH.toString()} />
              )}
            </td>
            <td>
              {isFetchingRemote ? remoteShimmer : (
                <>
                  {remoteInfo?.tdh?.toLocaleString()}
                  {remoteInfo?.tdh && <CopyIcon text={remoteInfo.tdh.toString()} />}
                </>
              )}
            </td>
            <td className="tw-justify-center">
              {printStatusIcon(tdhIcon, tdhStatus)}
            </td>
            <td>All TDH across the whole system</td>
          </tr>
          <hr className="tw-my-2 tw-w-full tw-border-0 tw-border-t tw-border-iron-700" />
          <tr>
            <td>Last Block</td>
            <td>
              {localInfo?.block}
              {localInfo?.block && (
                <CopyIcon text={localInfo.block.toString()} />
              )}
            </td>
            <td>
              {isFetchingRemote ? remoteShimmer : (
                <>
                  {remoteInfo?.block}
                  {remoteInfo?.block && (
                    <CopyIcon text={remoteInfo.block.toString()} />
                  )}
                </>
              )}
            </td>
            <td className="tw-justify-center">
              {printStatusIcon(blockIcon, blockStatus)}
            </td>
            <td>The last Ethereum block that has been used to calculate TDH</td>
          </tr>
          <hr className="tw-my-2 tw-w-full tw-border-0 tw-border-t tw-border-iron-700" />
          <tr>
            <td>Merkle Root</td>
            <td className="tw-break-all tw-text-sm">{localInfo?.merkleRoot}</td>
            <td className="tw-break-all tw-text-sm">
              {isFetchingRemote ? remoteShimmer : (remoteInfo?.merkle_root ?? "N/A")}
            </td>
            <td className="tw-justify-center">
              {printStatusIcon(merkleRootIcon, merkleRootStatus)}
            </td>
            <td>A hash of all TDH values for all addresses</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CopyIcon({ text }: { text: string }) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 500);
  };

  return (
    <>
      <FontAwesomeIcon
        className="tw-ml-2 tw-cursor-pointer tw-select-none"
        icon={faCopy}
        height={14}
        color={isCopied ? "green" : "white"}
        onClick={handleCopy}
      />
      {isCopied && (
        <span className="tw-ml-2 tw-text-sm tw-font-light tw-text-emerald-400">
          Copied!
        </span>
      )}
    </>
  );
}
