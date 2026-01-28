"use client";

import Confirm from "@/components/confirm/Confirm";
import LogsViewer from "@/components/core/logs-viewer/LogsViewer";
import CircleLoader from "@/components/distribution-plan-tool/common/CircleLoader";
import {
  ConfirmModalShell,
  confirmBtnPrimary,
  confirmBtnSecondary,
  confirmInputClass,
} from "@/components/shared/ConfirmModalShell";
import { useToast } from "@/contexts/ToastContext";
import {
  manualStartWorker,
  recalculateTransactionsOwners,
  resetTransactionsToBlock,
  resetWorker,
  stopWorker,
} from "@/electron";
import useIsMobileScreen from "@/hooks/isMobileScreen";
import {
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
  TRANSACTIONS_START_BLOCK,
} from "@/shared/types";
import { useState } from "react";
import { Tooltip } from "react-tooltip";
import { RPCProvider } from "./RpcProviders";
import TransactionsLocalData from "./TransactionsLocalData";

export interface Task {
  namespace: string;
  display: string;
  logFile: string;
  cronExpression: string;
  description: string;
  resetable: boolean;
  status?: {
    status: ScheduledWorkerStatus;
    message: string;
    action?: string;
    statusPercentage?: number;
  };
}

export interface TDHInfo {
  block: number;
  blockTimestamp: number;
  merkleRoot: string;
  lastCalculation: number;
  totalTDH: number;
}

const cronToHumanReadable = (cronExpression: string): string => {
  const [minute, hour, dayOfMonth, month, dayOfWeek] =
    cronExpression.split(" ");

  if (
    minute === "*/1" &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return "Runs every 1 minute";
  }

  if (
    minute?.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Runs every ${minute.slice(2)} minutes`;
  }

  if (
    minute === "0" &&
    hour === "*/1" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return "Runs every 1 hour";
  }

  if (
    minute === "0" &&
    hour?.startsWith("*/") &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `Runs every ${hour.slice(2)} hours`;
  }

  // Handle the case for "at <specific time>"
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    if (minute !== "*" && hour !== "*") {
      return cronToLocalTime(cronExpression);
    }
  }

  return cronExpression;
};

const cronToLocalTime = (cronExpression: string): string => {
  const [minute, hour] = cronExpression.split(" ");

  const d = new Date();
  const utcDate = new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      Number(hour),
      Number(minute)
    )
  );
  const localTime = utcDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const utcTime = utcDate.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });

  let utcDisplay = "";
  if (localTime !== utcTime) {
    utcDisplay = `(${utcTime} UTC)`;
  }

  return `Runs at ${localTime} local time ${utcDisplay}`;
};

export function WorkerCards({
  rpcProviders,
  tasks,
}: {
  readonly rpcProviders: RPCProvider[];
  readonly tasks: Task[];
}) {
  return (
    <div>
      {rpcProviders.length > 0 ? (
        <>
          {tasks.map((task) => (
            <WorkerCard key={task.namespace} task={task} />
          ))}
        </>
      ) : (
        <>Add RPC Providers to enable app workers</>
      )}
    </div>
  );
}

export function WorkerCard({
  task,
  customStatus,
}: {
  readonly task: Task;
  readonly customStatus?: string | undefined;
}) {
  const printStatus = () => {
    if (!task.cronExpression) {
      return <span>Always running</span>;
    }

    if (task.status?.status === ScheduledWorkerStatus.DISABLED) {
      return <span>Disabled</span>;
    }

    if (task.status?.status === ScheduledWorkerStatus.IDLE) {
      if (customStatus) {
        return <span>{customStatus}</span>;
      } else {
        return <span>Idle</span>;
      }
    }

    const printProgress = () => {
      let p = <></>;

      if (task.status?.action) {
        p = (
          <>
            {p}&nbsp;
            <span>{task.status.action}</span>
          </>
        );
      }

      return p;
    };

    const progressBg =
      task.status?.status === ScheduledWorkerStatus.COMPLETED
        ? "tw-bg-emerald-500"
        : task.status?.status === ScheduledWorkerStatus.ERROR
          ? "tw-bg-red-500"
          : "tw-bg-primary-500";
    const progressNowValue = task.status?.statusPercentage ?? 100;
    let progressNowLabel;
    if (task.status?.statusPercentage !== undefined) {
      progressNowLabel = task.status.statusPercentage;
    }

    return (
      <span>
        <div className="tw-flex tw-items-center tw-justify-end tw-gap-2">
          {progressNowLabel !== undefined && (
            <span className="tw-font-light tw-text-iron-400">
              {(Math.floor(progressNowLabel * 100) / 100).toLocaleString(
                "en-US",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }
              )}
              %
            </span>
          )}
          <div className="tw-h-4 tw-w-[20vw] tw-min-w-0 tw-overflow-hidden tw-rounded-full tw-bg-iron-800">
            <div
              className={`tw-h-full ${progressBg} ${task.status?.status === ScheduledWorkerStatus.RUNNING ? "tw-animate-pulse" : ""}`}
              style={{ width: `${progressNowValue}%` }}
            />
          </div>
        </div>
        <div className="tw-mt-1 tw-flex tw-text-right tw-text-sm tw-font-light tw-text-iron-400">
          <span>{task.status?.message}</span>
          {printProgress()}
        </div>
      </span>
    );
  };

  const isMobile = useIsMobileScreen();

  const [showResetToBlockConfirm, setShowResetToBlockConfirm] = useState(false);
  const [showRecalculateOwnersConfirm, setShowRecalculateOwnersConfirm] =
    useState(false);
  const [showResetWorkerConfirm, setShowResetWorkerConfirm] = useState(false);
  const [showResetNFTsConfirm, setShowResetNFTsConfirm] = useState(false);
  const [showRunNowConfirm, setShowRunNowConfirm] = useState(false);
  const [showStopWorkerConfirm, setShowStopWorkerConfirm] = useState(false);
  const { showToast } = useToast();

  const triggerResetToBlock = async (block: number) => {
    resetTransactionsToBlock(task.namespace, block)
      .then((data) => {
        if (data.error) {
          showToast(data.data, "error");
        } else {
          showToast("Reset to block started", "success");
        }
      })
      .finally(() => {
        setShowResetToBlockConfirm(false);
      });
  };

  const triggerRecalculateTransactionsOwners = async () => {
    recalculateTransactionsOwners()
      .then((data) => {
        if (data.error) {
          showToast(data.data, "error");
        } else {
          showToast(data.data, "success");
        }
      })
      .finally(() => {
        setShowRecalculateOwnersConfirm(false);
      });
  };

  const triggerResetWorker = async () => {
    resetWorker(task.namespace)
      .then((data) => {
        showToast(data.data, data.error ? "error" : "success");
      })
      .finally(() => {
        setShowResetWorkerConfirm(false);
        setShowResetNFTsConfirm(false);
      });
  };

  const triggerStartWorker = async () => {
    manualStartWorker(task.namespace)
      .then((data) => {
        showToast(data.data, data.error ? "error" : "success");
      })
      .finally(() => setShowRunNowConfirm(false));
  };

  const triggerStopWorker = async () => {
    stopWorker(task.namespace)
      .then((data) => {
        showToast(data.data, data.error ? "error" : "success");
      })
      .finally(() => setShowStopWorkerConfirm(false));
  };

  function advancedOptionsContent() {
    const infoButton = (id: string, content: any) => (
      <>
        {content}
        <Tooltip
          id={id}
          style={{
            backgroundColor: "#1F2937",
            color: "white",
            padding: "4px 8px",
          }}
          delayShow={150}
          place={"bottom"}
          openEvents={{ mouseenter: true }}
          closeEvents={{ mouseleave: true, blur: true, click: true }}
        >
          Click for more info
        </Tooltip>
      </>
    );

    const btnLight =
      "tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-white tw-px-3 tw-py-1.5 tw-text-sm tw-font-medium tw-text-black focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-iron-500 disabled:tw-opacity-50 desktop-hover:hover:tw-bg-iron-100";
    if (task.namespace === ScheduledWorkerNames.TDH_WORKER) {
      return (
        <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
          {infoButton(
            "recalculate-tdh-now-tooltip",
            <button
              type="button"
              className={btnLight}
              data-tooltip-id="recalculate-tdh-now-tooltip"
              onClick={() => setShowRunNowConfirm(true)}
              disabled={task.status?.status === ScheduledWorkerStatus.RUNNING}
            >
              Recalculate TDH Now
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
        {task.status?.status === ScheduledWorkerStatus.RUNNING
          ? infoButton(
              "stop-worker-tooltip",
              <button
                type="button"
                className={btnLight}
                data-tooltip-id="stop-worker-tooltip"
                onClick={() => setShowStopWorkerConfirm(true)}
              >
                Stop
              </button>
            )
          : infoButton(
              "run-now-tooltip",
              <button
                type="button"
                className={btnLight}
                data-tooltip-id="run-now-tooltip"
                onClick={() => setShowRunNowConfirm(true)}
              >
                Run Now
              </button>
            )}
        {task.resetable &&
          infoButton(
            "reset-worker-tooltip",
            <button
              type="button"
              className={btnLight}
              data-tooltip-id="reset-worker-tooltip"
              disabled={task.status?.status === ScheduledWorkerStatus.RUNNING}
              onClick={() => {
                if (task.namespace === ScheduledWorkerNames.NFTS_WORKER) {
                  setShowResetNFTsConfirm(true);
                } else {
                  setShowResetWorkerConfirm(true);
                }
              }}
            >
              Reset
            </button>
          )}
        {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER &&
          infoButton(
            "recalculate-owners-tooltip",
            <button
              type="button"
              className={btnLight}
              data-tooltip-id="recalculate-owners-tooltip"
              disabled={task.status?.status === ScheduledWorkerStatus.RUNNING}
              onClick={() => setShowRecalculateOwnersConfirm(true)}
            >
              Recalculate Owners
            </button>
          )}
        {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER &&
          infoButton(
            "reset-to-block-tooltip",
            <button
              type="button"
              className={btnLight}
              data-tooltip-id="reset-to-block-tooltip"
              onClick={() => setShowResetToBlockConfirm(true)}
            >
              Reset
            </button>
          )}
      </div>
    );
  }

  function getExtraActions() {
    const extraActions = [
      {
        name: "Advanced Options",
        content: advancedOptionsContent(),
      },
    ];

    if (task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER) {
      extraActions.unshift({
        name: "Data",
        content: <TransactionsLocalData />,
      });
    }

    return extraActions;
  }

  return (
    <div className="tw-pb-4">
      <div className="tw-rounded-xl tw-bg-iron-950 tw-p-5 tw-ring-1 tw-ring-inset tw-ring-iron-800">
        <div
          className={`tw-flex tw-flex-wrap tw-gap-2 tw-pb-2 ${isMobile ? "tw-flex-col tw-items-center" : "tw-flex-row tw-items-start tw-justify-between"}`}
        >
          <div
            className={`tw-flex tw-flex-col tw-gap-1 ${isMobile ? "tw-items-center" : "tw-items-start"}`}
          >
            <div className="tw-flex tw-items-center tw-gap-3 tw-pb-1">
              <span className="tw-text-lg tw-font-semibold tw-text-white">
                {task.display}
              </span>
              {task.status?.status === ScheduledWorkerStatus.RUNNING ? (
                <CircleLoader />
              ) : null}
            </div>
            <span className="tw-text-sm tw-text-iron-400">
              {task.description}
            </span>
            {task.cronExpression ? (
              <span className="tw-text-sm tw-text-iron-400">
                {cronToHumanReadable(task.cronExpression)}
              </span>
            ) : null}
          </div>
          <div
            className={`tw-flex tw-flex-col tw-gap-3 tw-pb-2 tw-pt-2 ${isMobile ? "tw-items-center" : "tw-items-end"}`}
          >
            {printStatus()}
          </div>
        </div>
        <div className="tw-mt-3">
          <LogsViewer
            filePath={task.logFile}
            extraActions={getExtraActions()}
          />
        </div>
      </div>
      {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER && (
        <ResetToBlockConfirm
          show={showResetToBlockConfirm}
          minBlock={TRANSACTIONS_START_BLOCK}
          onHide={() => setShowResetToBlockConfirm(false)}
          onConfirm={(block) => triggerResetToBlock(block)}
        />
      )}
      <Confirm
        show={showRecalculateOwnersConfirm}
        onHide={() => setShowRecalculateOwnersConfirm(false)}
        onConfirm={triggerRecalculateTransactionsOwners}
        title="Recalculate Owners"
        message={`Roll back the transactions database by 5,000 block, then re-process all NFT transactions stored in the local database and recalculates ownership and balances for each owner, ensuring accurate and up-to-date data for every token based on the transaction history. Use this if discrepancies in ownership or balance are detected.`}
      />
      <Confirm
        show={showResetWorkerConfirm}
        onHide={() => setShowResetWorkerConfirm(false)}
        onConfirm={triggerResetWorker}
        title="Reset Worker"
        message={`Reset all data to the start block. This will delete all transactions from the database. Subsequent sync processes will start syncing from the beginning.`}
      />
      <Confirm
        show={showResetNFTsConfirm}
        onHide={() => setShowResetNFTsConfirm(false)}
        onConfirm={triggerResetWorker}
        title="Reset All NFTs"
        message={`This will delete all NFTs in your database and start syncing from the beginning.`}
      />
      <Confirm
        show={showRunNowConfirm}
        onHide={() => setShowRunNowConfirm(false)}
        onConfirm={triggerStartWorker}
        title={
          task.namespace === ScheduledWorkerNames.TDH_WORKER
            ? "Run TDH Calculation Now"
            : `Run ${task.display} Now`
        }
        message={
          task.namespace === ScheduledWorkerNames.TDH_WORKER
            ? `Recalculate TDH for today now. This will delete all existing TDH data and recalculate it from the last TDH block.`
            : `Trigger the worker to run immediately, without affecting its scheduled runs.`
        }
      />
      <Confirm
        show={showStopWorkerConfirm}
        onHide={() => setShowStopWorkerConfirm(false)}
        onConfirm={triggerStopWorker}
        title={`Stop ${task.display}`}
        message={`Stop the current execution of this worker. The worker will be paused and will not run again until the next scheduled run.`}
      />
    </div>
  );
}

function ResetToBlockConfirm({
  show,
  minBlock,
  onHide,
  onConfirm,
}: {
  show: boolean;
  minBlock: number;
  onHide: () => void;
  onConfirm: (block: number) => void;
}) {
  const [block, setBlock] = useState("");

  const handleBackdrop = () => {
    onHide();
    setBlock("");
  };

  return (
    <ConfirmModalShell
      show={show}
      title="Reset to block"
      onBackdropClick={handleBackdrop}
      footer={
        <>
          <button
            type="button"
            onClick={handleBackdrop}
            className={confirmBtnSecondary}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(Number(block));
              setBlock("");
            }}
            disabled={!block || Number(block) < minBlock}
            className={confirmBtnPrimary}
          >
            Confirm
          </button>
        </>
      }
    >
      <p className="tw-mb-2 tw-mt-0">
        Roll back to a specific block number. All transactions after this block
        will be deleted, and ownership balances will be recalculated as if the
        sync only reached this block. Subsequent sync processes will update the
        data from this point forward.
      </p>
      <p className="tw-mb-4 tw-mt-2">
        Use &apos;Min Block&apos; button to reset to the earliest available
        block for this worker - {minBlock}.
      </p>
      <div className="tw-flex tw-w-full tw-gap-2">
        <input
          type="number"
          autoFocus
          min={minBlock}
          placeholder="Enter block number"
          aria-label="Block"
          value={block}
          className={`${confirmInputClass} tw-min-w-0 tw-flex-1`}
          onChange={(e) => {
            const value = e.target.value;
            const num = Number(value);
            if (!isNaN(num) && num >= 0) {
              setBlock(value);
            }
          }}
        />
        <button
          type="button"
          onClick={() => setBlock(minBlock.toString())}
          className={confirmBtnSecondary}
        >
          Min Block
        </button>
      </div>
    </ConfirmModalShell>
  );
}
