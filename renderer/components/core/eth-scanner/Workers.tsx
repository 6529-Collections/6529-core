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
import { NON_WALLET_MODAL_OVERLAY_CLASS } from "@/components/shared/modal-layers";
import { useToast } from "@/contexts/ToastContext";
import {
  fullRefreshWorker,
  manualStartWorker,
  recalculateTransactionsOwners,
  reconcileTransactions,
  resetTransactionsToBlock,
  resetWorker,
  stopWorker,
} from "@/electron";
import useIsMobileScreen from "@/hooks/isMobileScreen";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";
import {
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
  TRANSACTIONS_START_BLOCK,
} from "@/shared/types";
import { useState } from "react";
import { Tooltip } from "react-tooltip";
import NftLocalData from "./NftLocalData";
import { RPCProvider } from "./RpcProviders";
import TransactionsLocalData from "./TransactionsLocalData";
import WorkerActionButton from "./WorkerActionButton";

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
  needsRecalculation: boolean;
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
  const locale = useBrowserLocale();
  const isWorkerActive =
    task.status?.status === ScheduledWorkerStatus.STARTING ||
    task.status?.status === ScheduledWorkerStatus.RUNNING;
  const printStatus = () => {
    if (!task.cronExpression) {
      return <span>Always running</span>;
    }

    if (task.status?.status === ScheduledWorkerStatus.DISABLED) {
      return <span>Disabled</span>;
    }

    if (task.status?.status === ScheduledWorkerStatus.IDLE) {
      if (customStatus) {
        return <span role="status">{customStatus}</span>;
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
  const [
    showReconcileTransactionsConfirm,
    setShowReconcileTransactionsConfirm,
  ] = useState(false);
  const [showFullRefreshNFTsConfirm, setShowFullRefreshNFTsConfirm] =
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

  const triggerReconcileTransactions = async (fromBlock: number) => {
    try {
      const data = await reconcileTransactions(fromBlock);
      showToast(data.data, data.error ? "error" : "success");
    } catch {
      showToast(t(locale, "core.transactions.reconcile.error"), "error");
    } finally {
      setShowReconcileTransactionsConfirm(false);
    }
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

  const triggerFullRefreshWorker = async () => {
    fullRefreshWorker(task.namespace)
      .then((data) => {
        showToast(data.data, data.error ? "error" : "success");
      })
      .finally(() => setShowFullRefreshNFTsConfirm(false));
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

    if (task.namespace === ScheduledWorkerNames.TDH_WORKER) {
      return (
        <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
          {infoButton(
            "recalculate-tdh-now-tooltip",
            <WorkerActionButton
              data-tooltip-id="recalculate-tdh-now-tooltip"
              onClick={() => setShowRunNowConfirm(true)}
              disabled={isWorkerActive}
            >
              Recalculate TDH Now
            </WorkerActionButton>
          )}
        </div>
      );
    }

    return (
      <div className="tw-mt-3 tw-flex tw-flex-wrap tw-items-center tw-gap-3">
        {isWorkerActive
          ? infoButton(
              "stop-worker-tooltip",
              <WorkerActionButton
                data-tooltip-id="stop-worker-tooltip"
                onClick={() => setShowStopWorkerConfirm(true)}
              >
                Stop
              </WorkerActionButton>
            )
          : infoButton(
              "run-now-tooltip",
              <WorkerActionButton
                data-tooltip-id="run-now-tooltip"
                onClick={() => setShowRunNowConfirm(true)}
              >
                Run Now
              </WorkerActionButton>
            )}
        {task.namespace === ScheduledWorkerNames.NFTS_WORKER &&
          infoButton(
            "full-refresh-nfts-tooltip",
            <WorkerActionButton
              data-tooltip-id="full-refresh-nfts-tooltip"
              disabled={isWorkerActive}
              onClick={() => setShowFullRefreshNFTsConfirm(true)}
            >
              Full Refresh
            </WorkerActionButton>,
          )}
        {task.resetable &&
          infoButton(
            "reset-worker-tooltip",
            <WorkerActionButton
              data-tooltip-id="reset-worker-tooltip"
              disabled={isWorkerActive}
              onClick={() => {
                if (task.namespace === ScheduledWorkerNames.NFTS_WORKER) {
                  setShowResetNFTsConfirm(true);
                } else {
                  setShowResetWorkerConfirm(true);
                }
              }}
            >
              Reset
            </WorkerActionButton>
          )}
        {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER &&
          infoButton(
            "reconcile-transactions-tooltip",
            <WorkerActionButton
              data-tooltip-id="reconcile-transactions-tooltip"
              disabled={isWorkerActive}
              onClick={() => setShowReconcileTransactionsConfirm(true)}
            >
              {t(locale, "core.transactions.actions.reconcile")}
            </WorkerActionButton>
          )}
        {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER &&
          infoButton(
            "recalculate-owners-tooltip",
            <WorkerActionButton
              data-tooltip-id="recalculate-owners-tooltip"
              disabled={isWorkerActive}
              onClick={() => setShowRecalculateOwnersConfirm(true)}
            >
              {t(locale, "core.transactions.actions.rebuildOwnership")}
            </WorkerActionButton>
          )}
        {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER &&
          infoButton(
            "reset-to-block-tooltip",
            <WorkerActionButton
              data-tooltip-id="reset-to-block-tooltip"
              disabled={isWorkerActive}
              onClick={() => setShowResetToBlockConfirm(true)}
            >
              {t(locale, "core.transactions.actions.resetToBlock")}
            </WorkerActionButton>
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

    if (task.namespace === ScheduledWorkerNames.NFTS_WORKER) {
      extraActions.unshift({
        name: "Data",
        content: <NftLocalData />,
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
              {isWorkerActive ? (
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
        <>
          <ReconcileTransactionsConfirm
            show={showReconcileTransactionsConfirm}
            minBlock={TRANSACTIONS_START_BLOCK}
            onHide={() => setShowReconcileTransactionsConfirm(false)}
            onConfirm={(block) => triggerReconcileTransactions(block)}
          />
          <ResetToBlockConfirm
            show={showResetToBlockConfirm}
            minBlock={TRANSACTIONS_START_BLOCK}
            onHide={() => setShowResetToBlockConfirm(false)}
            onConfirm={(block) => triggerResetToBlock(block)}
          />
        </>
      )}
      <Confirm
        overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
        show={showRecalculateOwnersConfirm}
        onHide={() => setShowRecalculateOwnersConfirm(false)}
        onConfirm={triggerRecalculateTransactionsOwners}
        title={t(locale, "core.transactions.ownershipRebuild.title")}
        message={t(locale, "core.transactions.ownershipRebuild.body")}
      />
      <Confirm
        overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
        show={showFullRefreshNFTsConfirm}
        onHide={() => setShowFullRefreshNFTsConfirm(false)}
        onConfirm={triggerFullRefreshWorker}
        title="Full Refresh NFTs"
        message={`Refresh all indexed NFTs from chain and metadata without deleting local NFT data.`}
      />
      <Confirm
        overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
        show={showResetWorkerConfirm}
        onHide={() => setShowResetWorkerConfirm(false)}
        onConfirm={triggerResetWorker}
        title="Reset Worker"
        message={`Reset all data to the start block. This will delete all transactions from the database. Subsequent sync processes will start syncing from the beginning.`}
      />
      <Confirm
        overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
        show={showResetNFTsConfirm}
        onHide={() => setShowResetNFTsConfirm(false)}
        onConfirm={triggerResetWorker}
        title="Reset All NFTs"
        message={`This will delete all NFTs in your database and start syncing from the beginning.`}
      />
      <Confirm
        overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
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
        overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
        show={showStopWorkerConfirm}
        onHide={() => setShowStopWorkerConfirm(false)}
        onConfirm={triggerStopWorker}
        title={`Stop ${task.display}`}
        message={`Stop the current execution of this worker. The worker will be paused and will not run again until the next scheduled run.`}
      />
    </div>
  );
}

function ReconcileTransactionsConfirm({
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
  const locale = useBrowserLocale();
  const [mode, setMode] = useState<"from-block" | "full-history">("from-block");
  const [block, setBlock] = useState("");

  const resetAndHide = () => {
    setMode("from-block");
    setBlock("");
    onHide();
  };
  const selectedBlock = mode === "full-history" ? minBlock : Number(block);
  const canConfirm =
    mode === "full-history" ||
    (!!block && Number.isInteger(selectedBlock) && selectedBlock >= minBlock);

  return (
    <ConfirmModalShell
      overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
      show={show}
      title={t(locale, "core.transactions.reconcile.title")}
      onBackdropClick={resetAndHide}
      footer={
        <>
          <button
            type="button"
            onClick={resetAndHide}
            className={confirmBtnSecondary}
          >
            {t(locale, "core.transactions.reconcile.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(selectedBlock);
              setMode("from-block");
              setBlock("");
            }}
            disabled={!canConfirm}
            className={confirmBtnPrimary}
          >
            {t(locale, "core.transactions.reconcile.confirm")}
          </button>
        </>
      }
    >
      <p className="tw-mb-4 tw-mt-0">
        {t(locale, "core.transactions.reconcile.body")}
      </p>
      <fieldset className="tw-m-0 tw-flex tw-flex-col tw-gap-3 tw-border-0 tw-p-0">
        <legend className="tw-sr-only">
          {t(locale, "core.transactions.reconcile.rangeLegend")}
        </legend>
        <label className="tw-flex tw-cursor-pointer tw-items-center tw-gap-2">
          <input
            type="radio"
            name="transaction-reconciliation-mode"
            checked={mode === "from-block"}
            onChange={() => setMode("from-block")}
          />
          <span>{t(locale, "core.transactions.reconcile.fromBlock")}</span>
        </label>
        <input
          type="number"
          min={minBlock}
          placeholder={t(
            locale,
            "core.transactions.reconcile.blockPlaceholder"
          )}
          aria-label={t(locale, "core.transactions.reconcile.blockAriaLabel")}
          value={block}
          disabled={mode !== "from-block"}
          className={confirmInputClass}
          onChange={(event) => setBlock(event.target.value)}
        />
        <label className="tw-flex tw-cursor-pointer tw-items-center tw-gap-2">
          <input
            type="radio"
            name="transaction-reconciliation-mode"
            checked={mode === "full-history"}
            onChange={() => setMode("full-history")}
          />
          <span>
            {t(locale, "core.transactions.reconcile.fullHistory", {
              block: minBlock,
            })}
          </span>
        </label>
      </fieldset>
      <p className="tw-mb-0 tw-mt-4 tw-text-sm tw-text-iron-400">
        {t(locale, "core.transactions.reconcile.note")}
      </p>
    </ConfirmModalShell>
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
      overlayClassName={NON_WALLET_MODAL_OVERLAY_CLASS}
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
