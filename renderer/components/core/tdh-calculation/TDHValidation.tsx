"use client";

import { publicEnv } from "@/config/env";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faCheckCircle,
  faMinusCircle,
  faXmarkCircle,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Tooltip } from "react-tooltip";
import type { TooltipRefProps } from "react-tooltip";
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
  const copyTooltipRef = useRef<TooltipRefProps>(null);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const isCopyFeedbackVisible = useRef(false);
  const [copyAnnouncement, setCopyAnnouncement] = useState("");

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

  useEffect(
    () => () => {
      if (copyFeedbackTimer.current) {
        clearTimeout(copyFeedbackTimer.current);
      }
    },
    []
  );

  const showCopyHover = (anchorId: string) => {
    if (isCopyFeedbackVisible.current) {
      return;
    }
    copyTooltipRef.current?.open({
      anchorSelect: `#${anchorId}`,
      content: "Click to copy",
      delay: 150,
    });
  };

  const hideCopyHover = () => {
    if (!isCopyFeedbackVisible.current) {
      copyTooltipRef.current?.close();
    }
  };

  const showCopyFeedback = (anchorId: string, status: "copied" | "failed") => {
    const message = status === "copied" ? "Copied" : "Copy failed";
    isCopyFeedbackVisible.current = true;
    setCopyAnnouncement(message);
    if (copyFeedbackTimer.current) {
      clearTimeout(copyFeedbackTimer.current);
    }
    copyTooltipRef.current?.open({
      anchorSelect: `#${anchorId}`,
      content: message,
    });
    copyFeedbackTimer.current = setTimeout(() => {
      isCopyFeedbackVisible.current = false;
      setCopyAnnouncement("");
      copyTooltipRef.current?.close();
    }, 2000);
  };

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
    <div className="tw-overflow-hidden tw-rounded-xl tw-border tw-border-iron-800 tw-bg-iron-950 tw-p-5 tw-ring-1 tw-ring-inset tw-ring-iron-800 [&_table]:tw-w-full [&_table]:tw-table-fixed [&_tbody_tr]:tw-w-full [&_td:nth-child(1)]:tw-flex-[0_0_8rem] [&_td:nth-child(1)]:tw-whitespace-nowrap [&_td:nth-child(2)]:tw-flex-[1.5_1_0%] [&_td:nth-child(3)]:tw-flex-[1.5_1_0%] [&_td:nth-child(4)]:tw-flex-[0_0_5rem] [&_td:nth-child(5)]:tw-flex-[1.3_1_0%] [&_td]:tw-flex [&_td]:tw-min-h-[65px] [&_td]:tw-items-center [&_td]:tw-gap-2 [&_td]:tw-p-2 [&_th:nth-child(1)]:tw-flex-[0_0_8rem] [&_th:nth-child(1)]:tw-whitespace-nowrap [&_th:nth-child(2)]:tw-flex-[1.5_1_0%] [&_th:nth-child(3)]:tw-flex-[1.5_1_0%] [&_th:nth-child(4)]:tw-flex-[0_0_5rem] [&_th:nth-child(5)]:tw-flex-[1.3_1_0%] [&_th]:tw-flex [&_th]:tw-items-center [&_th]:tw-gap-2 [&_th]:tw-p-2 [&_th]:tw-text-left [&_thead_tr]:tw-border-b [&_thead_tr]:tw-border-iron-800 [&_tr]:tw-flex [&_tr]:tw-flex-row [&_tr]:tw-items-stretch">
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
              {localInfo?.totalTDH !== undefined && (
                <CopyableValue
                  text={localInfo.totalTDH.toString()}
                  onHover={showCopyHover}
                  onLeave={hideCopyHover}
                  onFeedback={showCopyFeedback}
                >
                  {localInfo.totalTDH.toLocaleString()}
                </CopyableValue>
              )}
            </td>
            <td>
              {isFetchingRemote ? remoteShimmer : (
                remoteInfo?.tdh !== undefined && (
                  <CopyableValue
                    text={remoteInfo.tdh.toString()}
                    onHover={showCopyHover}
                    onLeave={hideCopyHover}
                    onFeedback={showCopyFeedback}
                  >
                    {remoteInfo.tdh.toLocaleString()}
                  </CopyableValue>
                )
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
              {localInfo?.block !== undefined && (
                <CopyableValue
                  text={localInfo.block.toString()}
                  onHover={showCopyHover}
                  onLeave={hideCopyHover}
                  onFeedback={showCopyFeedback}
                >
                  {localInfo.block}
                </CopyableValue>
              )}
            </td>
            <td>
              {isFetchingRemote ? remoteShimmer : (
                remoteInfo?.block !== undefined && (
                  <CopyableValue
                    text={remoteInfo.block.toString()}
                    onHover={showCopyHover}
                    onLeave={hideCopyHover}
                    onFeedback={showCopyFeedback}
                  >
                    {remoteInfo.block}
                  </CopyableValue>
                )
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
            <td className="tw-min-w-0 tw-text-sm">
              {localInfo?.merkleRoot && (
                <CopyableValue
                  text={localInfo.merkleRoot}
                  className="tw-min-w-0 tw-break-all"
                  onHover={showCopyHover}
                  onLeave={hideCopyHover}
                  onFeedback={showCopyFeedback}
                >
                  {localInfo.merkleRoot}
                </CopyableValue>
              )}
            </td>
            <td className="tw-min-w-0 tw-text-sm">
              {isFetchingRemote ? remoteShimmer : (
                remoteInfo?.merkle_root ? (
                  <CopyableValue
                    text={remoteInfo.merkle_root}
                    className="tw-min-w-0 tw-break-all"
                    onHover={showCopyHover}
                    onLeave={hideCopyHover}
                    onFeedback={showCopyFeedback}
                  >
                    {remoteInfo.merkle_root}
                  </CopyableValue>
                ) : (
                  "N/A"
                )
              )}
            </td>
            <td className="tw-justify-center">
              {printStatusIcon(merkleRootIcon, merkleRootStatus)}
            </td>
            <td>A hash of all TDH values for all addresses</td>
          </tr>
        </tbody>
      </table>
      <Tooltip
        ref={copyTooltipRef}
        imperativeModeOnly
        place="top"
        opacity={1}
        variant="light"
      />
      <span className="tw-sr-only" role="status" aria-live="polite">
        {copyAnnouncement}
      </span>
    </div>
  );
}

function CopyableValue({
  text,
  children,
  className = "",
  onHover,
  onLeave,
  onFeedback,
}: {
  text: string;
  children: ReactNode;
  className?: string;
  onHover: (anchorId: string) => void;
  onLeave: () => void;
  onFeedback: (anchorId: string, status: "copied" | "failed") => void;
}) {
  const anchorId = `tdh-copy-${useId().replaceAll(":", "")}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onFeedback(anchorId, "copied");
    } catch {
      onFeedback(anchorId, "failed");
    }
  };

  return (
    <span className="tw-min-w-0">
      <button
        id={anchorId}
        type="button"
        aria-label="Copy value"
        className={`${className} tw-cursor-pointer tw-border-0 tw-bg-transparent tw-p-0 tw-text-left tw-font-[inherit] tw-text-inherit focus-visible:tw-rounded focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500`}
        onMouseEnter={() => onHover(anchorId)}
        onMouseLeave={onLeave}
        onFocus={() => onHover(anchorId)}
        onBlur={onLeave}
        onClick={handleCopy}
      >
        {children}
      </button>
    </span>
  );
}
