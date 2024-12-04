import styles from "./ETHScanner.module.scss";
import {
  Container,
  Row,
  Col,
  Button,
  Form,
  InputGroup,
  ProgressBar,
} from "react-bootstrap";
import { RPCProvider } from "./RpcProviders";
import {
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
  TRANSACTIONS_START_BLOCK,
} from "../../../../shared/types";
import useIsMobileScreen from "../../../hooks/isMobileScreen";
import CircleLoader from "../../distribution-plan-tool/common/CircleLoader";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Tippy from "@tippyjs/react";
import { useState } from "react";
import Confirm from "../../confirm/Confirm";
import {
  manualStartWorker,
  recalculateTransactionsOwners,
  resetTransactionsToBlock,
  resetWorker,
} from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";
import LogsViewer from "../logs-viewer/LogsViewer";

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
    minute.startsWith("*/") &&
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
    hour.startsWith("*/") &&
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
  homeDir,
  rpcProviders,
  tasks,
}: {
  readonly homeDir: string;
  readonly rpcProviders: RPCProvider[];
  readonly tasks: Task[];
}) {
  return (
    <Container className="no-padding">
      <Row>
        <Col>
          {rpcProviders.length > 0 ? (
            <>
              {tasks.map((task) => (
                <WorkerCard key={task.namespace} task={task} />
              ))}
            </>
          ) : (
            <>Add RPC Providers to enable app workers</>
          )}
        </Col>
      </Row>
    </Container>
  );
}

export function WorkerCard({
  task,
  customStatus,
}: {
  readonly task: Task;
  readonly customStatus?: string;
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

    let progressVariant = "info";
    if (task.status?.status === ScheduledWorkerStatus.COMPLETED) {
      progressVariant = "success";
    } else if (task.status?.status === ScheduledWorkerStatus.ERROR) {
      progressVariant = "danger";
    }

    const progressNowValue = task.status?.statusPercentage ?? 100;
    let progressNowLabel;
    if (task.status?.statusPercentage !== undefined) {
      progressNowLabel = task.status.statusPercentage;
    }

    return (
      <span>
        <div className="d-flex align-items-center justify-content-end gap-2">
          {progressNowLabel && (
            <span className="font-lighter">
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
          <ProgressBar
            now={progressNowValue}
            style={{ width: "20vw" }}
            variant={progressVariant}
            striped={task.status?.status === ScheduledWorkerStatus.RUNNING}
            animated={task.status?.status === ScheduledWorkerStatus.RUNNING}
          />
        </div>
        <div className="text-right font-smaller font-color-h mt-1 d-flex font-lighter">
          <span>{task.status?.message}</span>
          {printProgress()}
        </div>
      </span>
    );
  };

  const isMobile = useIsMobileScreen();

  const [resetToBlock, setResetToBlock] = useState("");
  const [showResetToBlockConfirm, setShowResetToBlockConfirm] = useState(false);
  const [showRecalculateOwnersConfirm, setShowRecalculateOwnersConfirm] =
    useState(false);
  const [showResetWorkerConfirm, setShowResetWorkerConfirm] = useState(false);
  const [showRefreshNFTsConfirm, setShowRefreshNFTsConfirm] = useState(false);
  const [showRunNowConfirm, setShowRunNowConfirm] = useState(false);
  const { showToast } = useToast();

  const triggerResetToBlock = async () => {
    resetTransactionsToBlock(task.namespace, Number(resetToBlock))
      .then((data) => {
        if (data.error) {
          showToast(data.data, "error");
        } else {
          showToast("Reset to block started", "success");
        }
      })
      .finally(() => {
        setShowResetToBlockConfirm(false);
        setResetToBlock("");
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
        setShowRefreshNFTsConfirm(false);
      });
  };

  const triggerStartWorker = async () => {
    manualStartWorker(task.namespace)
      .then((data) => {
        showToast(data.data, data.error ? "error" : "success");
      })
      .finally(() => setShowRunNowConfirm(false));
  };

  function extraActionContent() {
    const infoButton = (content: any) => (
      <Tippy
        delay={500}
        placement="bottom"
        theme="light"
        trigger="mouseenter"
        content={
          <span className="d-flex align-items-center gap-1">
            <FontAwesomeIcon icon={faInfoCircle} height={15} />
            Click for more info
          </span>
        }>
        {content}
      </Tippy>
    );

    if (task.namespace === ScheduledWorkerNames.TDH_WORKER) {
      return (
        <Container className="mt-3 no-padding">
          <Row>
            <Col className="d-flex gap-3 align-items-center">
              {infoButton(
                <Button
                  variant="light"
                  onClick={() => setShowRunNowConfirm(true)}
                  disabled={
                    task.status?.status === ScheduledWorkerStatus.RUNNING
                  }>
                  Recalculate TDH Now
                </Button>
              )}
            </Col>
          </Row>
        </Container>
      );
    }

    return (
      <Container className="mt-3 no-padding">
        <Row>
          <Col className="d-flex gap-3 align-items-center">
            {infoButton(
              <Button
                variant="light"
                onClick={() => setShowRunNowConfirm(true)}
                disabled={
                  task.status?.status === ScheduledWorkerStatus.RUNNING
                }>
                Run Now
              </Button>
            )}
            {task.resetable &&
              infoButton(
                <Button
                  variant="light"
                  disabled={
                    task.status?.status === ScheduledWorkerStatus.RUNNING
                  }
                  onClick={() => {
                    if (task.namespace === ScheduledWorkerNames.NFTS_WORKER) {
                      setShowRefreshNFTsConfirm(true);
                    } else {
                      setShowResetWorkerConfirm(true);
                    }
                  }}>
                  {task.namespace === ScheduledWorkerNames.NFTS_WORKER
                    ? "Refresh All NFTs"
                    : "Reset"}
                </Button>
              )}
            {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER && (
              <>
                {infoButton(
                  <Button
                    disabled={
                      task.status?.status === ScheduledWorkerStatus.RUNNING
                    }
                    variant="light"
                    onClick={() => setShowRecalculateOwnersConfirm(true)}>
                    Recalculate Owners
                  </Button>
                )}
                <InputGroup style={{ width: "350px" }}>
                  <Form.Control
                    className="no-glow"
                    type="number"
                    autoFocus
                    placeholder={`Min Block: ${TRANSACTIONS_START_BLOCK}`}
                    aria-label="Block"
                    aria-describedby="block-addon"
                    value={resetToBlock}
                    onChange={(e) => {
                      const value = e.target.value;
                      const num = Number(value);
                      if (!isNaN(num) && num >= 0) {
                        setResetToBlock(value);
                      }
                    }}
                  />
                  {infoButton(
                    <Button
                      disabled={
                        !resetToBlock ||
                        Number(resetToBlock) < TRANSACTIONS_START_BLOCK ||
                        task.status?.status === ScheduledWorkerStatus.RUNNING
                      }
                      variant="light"
                      style={{ borderLeft: "2px solid #ced4da" }}
                      onClick={() => setShowResetToBlockConfirm(true)}>
                      Reset to block
                    </Button>
                  )}
                </InputGroup>
              </>
            )}
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container className="no-padding pt-2 pb-4">
      <Row>
        <Col>
          <Col xs={12}>
            <Container className={styles.logCard}>
              <Row>
                <Col
                  xs={12}
                  md={6}
                  className={`pt-2 pb-2 d-flex flex-column gap-2 justify-content-center ${
                    isMobile ? "align-items-center" : "align-items-start"
                  }`}>
                  <span
                    className={`pt-1 pb-1 d-flex flex-column gap-1 justify-content-center ${
                      isMobile ? "align-items-center" : "align-items-start"
                    }`}>
                    <span className="d-flex align-items-center gap-3">
                      <span className="font-bolder font-larger">
                        {task.display}
                      </span>
                      {task.status?.status === ScheduledWorkerStatus.RUNNING ? (
                        <CircleLoader />
                      ) : null}
                    </span>
                    <span className="font-smaller font-color-h">
                      {task.description}
                    </span>
                    {task.cronExpression ? (
                      <span className="font-smaller font-color-h">
                        {cronToHumanReadable(task.cronExpression)}
                      </span>
                    ) : null}
                  </span>
                </Col>
                <Col
                  xs={12}
                  md={6}
                  className={`pt-2 pb-2 d-flex flex-column gap-3 justify-content-center ${
                    isMobile ? "align-items-center" : "align-items-end"
                  }`}>
                  {printStatus()}
                </Col>
              </Row>
              <Row className="mt-3">
                <Col>
                  <LogsViewer
                    filePath={task.logFile}
                    extraAction="Advanced Options"
                    extraActionContent={extraActionContent()}
                  />
                </Col>
              </Row>
            </Container>
          </Col>
        </Col>
      </Row>
      <Confirm
        show={showResetToBlockConfirm}
        onHide={() => setShowResetToBlockConfirm(false)}
        onConfirm={triggerResetToBlock}
        title="Reset to block"
        message={`Roll back to block number ${resetToBlock}. All transactions after this block will be deleted, and ownership balances will be recalculated as if the sync only reached this block. Subsequent sync processes will update the data from this point forward.`}
      />
      <Confirm
        show={showRecalculateOwnersConfirm}
        onHide={() => setShowRecalculateOwnersConfirm(false)}
        onConfirm={triggerRecalculateTransactionsOwners}
        title="Recalculate Owners"
        message={`Re-process all NFT transactions stored in the local database and recalculates ownership and balances for each owner, ensuring accurate and up-to-date data for every token based on the transaction history. Use this if discrepancies in ownership or balance are detected.`}
      />
      <Confirm
        show={showResetWorkerConfirm}
        onHide={() => setShowResetWorkerConfirm(false)}
        onConfirm={triggerResetWorker}
        title="Reset Worker"
        message={`Reset all data to the start block. This will delete all transactions from the database. Subsequent sync processes will start syncing from the beginning.`}
      />
      <Confirm
        show={showRefreshNFTsConfirm}
        onHide={() => setShowRefreshNFTsConfirm(false)}
        onConfirm={triggerResetWorker}
        title="Refresh All NFTs"
        message={`This will iterate through all NFTs in your database and refresh their data from the blockchain.`}
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
    </Container>
  );
}
