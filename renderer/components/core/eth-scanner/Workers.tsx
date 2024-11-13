import styles from "./ETHScanner.module.scss";

import { Container, Row, Col, Button, Form, InputGroup } from "react-bootstrap";
import { RPCProvider } from "./RpcProviders";
import {
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
  TRANSACTIONS_START_BLOCK,
} from "../../../../shared/types";
import useIsMobileScreen from "../../../hooks/isMobileScreen";
import CircleLoader from "../../distribution-plan-tool/common/CircleLoader";
import {
  faChevronDown,
  faChevronUp,
  faCopy,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Tippy from "@tippyjs/react";
import { useState } from "react";
import Confirm from "../../confirm/Confirm";
import {
  manualStartWorker,
  rebalanceTransactionsOwners,
  resetTransactionsToBlock,
} from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";

export interface Task {
  namespace: string;
  display: string;
  logFile: string;
  cronExpression: string;
  status?: {
    status: ScheduledWorkerStatus;
    message: string;
    action?: string;
    progress?: number;
    target?: number;
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
    return "every 1 minute";
  }

  if (
    minute.startsWith("*/") &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `every ${minute.slice(2)} minutes`;
  }

  if (
    minute === "0" &&
    hour === "*/1" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return "every 1 hour";
  }

  if (
    minute === "0" &&
    hour.startsWith("*/") &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return `every ${hour.slice(2)} hours`;
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

  return `at ${localTime} (local time)`;
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
                <WorkerCard
                  key={task.namespace}
                  homeDir={homeDir}
                  task={task}
                />
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
  homeDir,
  task,
}: {
  readonly homeDir: string;
  readonly task: Task;
}) {
  const displayPath = task.logFile.startsWith(homeDir)
    ? `~${task.logFile.replace(homeDir, "")}`
    : `${task.logFile}`;

  const printStatus = () => {
    if (!task.cronExpression) {
      return <span>Always running</span>;
    }

    if (task.status?.status === ScheduledWorkerStatus.DISABLED) {
      return <span>Disabled</span>;
    }

    if (task.status?.status === ScheduledWorkerStatus.IDLE) {
      return <span>Idle</span>;
    }

    const printProgress = () => {
      let p = <></>;
      if (task.status?.progress) {
        p = (
          <>
            :&nbsp;
            <span className={styles.progress}>{task.status.progress}</span>
          </>
        );
      }
      if (task.status?.target) {
        p = (
          <>
            {p}&nbsp;&minus;&nbsp;
            <span className={styles.progress}>{task.status.target}</span>
          </>
        );
      }
      if (task.status?.statusPercentage) {
        p = (
          <>
            {p}&nbsp;({task.status.statusPercentage.toFixed(2)}%)
          </>
        );
      }

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

    return (
      <span>
        {task.status?.message}
        {printProgress()}
      </span>
    );
  };

  const isMobile = useIsMobileScreen();

  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const [resetToBlock, setResetToBlock] = useState("");
  const [showResetToBlockConfirm, setShowResetToBlockConfirm] = useState(false);
  const [showRebalanceOwnersConfirm, setShowRebalanceOwnersConfirm] =
    useState(false);

  const { showToast } = useToast();

  const triggerResetToBlock = async () => {
    resetTransactionsToBlock(Number(resetToBlock))
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

  const triggerRebalanceTransactionsOwners = async () => {
    rebalanceTransactionsOwners()
      .then((data) => {
        if (data.error) {
          showToast(data.data, "error");
        } else {
          showToast("Rebalance owners started", "success");
        }
      })
      .finally(() => {
        setShowRebalanceOwnersConfirm(false);
      });
  };

  return (
    <Container className="no-padding pt-2 pb-2">
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
                    {task.cronExpression ? (
                      <span className="font-smaller font-color-h">
                        {cronToHumanReadable(task.cronExpression)}
                      </span>
                    ) : null}
                  </span>
                  {printStatus()}
                </Col>
                <Col
                  xs={12}
                  md={6}
                  className={`pt-2 pb-2 d-flex flex-column gap-3 justify-content-center ${
                    isMobile ? "align-items-center" : "align-items-end"
                  }`}>
                  <span className="font-smaller font-color-h">
                    {displayPath}
                  </span>
                  <span className="d-flex align-items-center gap-3">
                    <Button
                      size="sm"
                      variant="dark"
                      onClick={() => window.api.showFile(task.logFile)}>
                      <span className="font-smaller">Open Folder</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="dark"
                      onClick={() =>
                        window.api.openLogs(task.display, task.logFile)
                      }>
                      <span className="font-smaller">View Logs</span>
                    </Button>
                  </span>
                </Col>
              </Row>
              <Row className="pt-1">
                <Col className="d-flex align-items-center justify-content-between"></Col>
              </Row>
              {task.namespace === ScheduledWorkerNames.TRANSACTIONS_WORKER && (
                <Row>
                  <Col>
                    <Button
                      variant="link"
                      className="d-flex align-items-center gap-1 decoration-none"
                      onClick={() =>
                        setShowAdvancedOptions(!showAdvancedOptions)
                      }>
                      <span>Advanced</span>
                      <FontAwesomeIcon
                        icon={showAdvancedOptions ? faChevronUp : faChevronDown}
                        height={16}
                      />
                    </Button>
                  </Col>
                </Row>
              )}
              {showAdvancedOptions && (
                <Row className="pt-2">
                  <Col className="d-flex gap-3 align-items-center">
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
                      <Button
                        disabled={
                          !resetToBlock ||
                          Number(resetToBlock) < TRANSACTIONS_START_BLOCK
                        }
                        variant="light"
                        style={{ borderLeft: "2px solid #ced4da" }}
                        onClick={() => setShowResetToBlockConfirm(true)}>
                        Reset to block
                      </Button>
                    </InputGroup>
                    <Button
                      variant="light"
                      onClick={() => setShowRebalanceOwnersConfirm(true)}>
                      Rebalance Owners
                    </Button>
                  </Col>
                </Row>
              )}
            </Container>
          </Col>
        </Col>
      </Row>
      <Confirm
        show={showResetToBlockConfirm}
        onHide={() => setShowResetToBlockConfirm(false)}
        onConfirm={triggerResetToBlock}
        title="Reset to block"
        message={`Are you sure you want to reset to block ${resetToBlock}?`}
      />
      <Confirm
        show={showRebalanceOwnersConfirm}
        onHide={() => setShowRebalanceOwnersConfirm(false)}
        onConfirm={triggerRebalanceTransactionsOwners}
        title="Rebalance Owners"
        message={`Are you sure you want to rebalance owners?`}
      />
    </Container>
  );
}

export function TDHWorkerCard({
  tdhInfo,
  isRunningTDH,
  calculateTDHNow,
}: {
  readonly tdhInfo?: TDHInfo;
  readonly isRunningTDH: boolean;
  readonly calculateTDHNow: () => void;
}) {
  const [blockCopied, setBlockCopied] = useState(false);
  const [totalTDHCopied, setTotalTDHCopied] = useState(false);
  const [merkleRootCopied, setMerkleRootCopied] = useState(false);

  return (
    <Container className={styles.logCard}>
      <Row>
        <Col>
          {tdhInfo ? (
            <div className="d-flex flex-wrap gap-3 justify-content-between align-items-center">
              <div className="d-flex flex-column gap-1">
                <div className="d-flex flex-wrap gap-4 align-items-center">
                  <span className="d-flex flex-column gap-1">
                    Block
                    <span className="d-flex align-items-center gap-1">
                      <span className={styles.progress}>{tdhInfo.block}</span>
                      <Tippy
                        content={blockCopied ? "Copied!" : "Copy"}
                        hideOnClick={false}
                        placement="top"
                        theme="light">
                        <FontAwesomeIcon
                          className="cursor-pointer unselectable"
                          icon={faCopy}
                          height={16}
                          onClick={() => {
                            navigator.clipboard.writeText(
                              tdhInfo.block.toString()
                            );
                            setBlockCopied(true);
                            setTimeout(() => {
                              setBlockCopied(false);
                            }, 1500);
                          }}
                        />
                      </Tippy>
                    </span>
                  </span>
                  <span className="d-flex flex-column gap-1">
                    Total TDH
                    <span className="d-flex align-items-center gap-1">
                      <span className={styles.progress}>
                        {tdhInfo.totalTDH.toLocaleString()}
                      </span>
                      <Tippy
                        content={totalTDHCopied ? "Copied!" : "Copy"}
                        hideOnClick={false}
                        placement="top"
                        theme="light">
                        <FontAwesomeIcon
                          className="cursor-pointer unselectable"
                          icon={faCopy}
                          height={16}
                          onClick={() => {
                            navigator.clipboard.writeText(
                              tdhInfo.totalTDH.toString()
                            );
                            setTotalTDHCopied(true);
                            setTimeout(() => {
                              setTotalTDHCopied(false);
                            }, 1500);
                          }}
                        />
                      </Tippy>
                    </span>
                  </span>
                  <span className="d-flex flex-column gap-1">
                    Last Calculation
                    <span className={styles.progress}>
                      {new Date(
                        tdhInfo.lastCalculation * 1000
                      ).toLocaleString()}
                    </span>
                  </span>
                </div>
                <div className="mt-3 d-flex flex-column gap-1">
                  Merkle Root
                  <span className="d-flex align-items-center gap-1">
                    <span className={styles.progress}>
                      {tdhInfo.merkleRoot}
                    </span>
                    <Tippy
                      content={merkleRootCopied ? "Copied!" : "Copy"}
                      hideOnClick={false}
                      placement="top"
                      theme="light">
                      <FontAwesomeIcon
                        className="cursor-pointer unselectable"
                        icon={faCopy}
                        height={18}
                        onClick={() => {
                          navigator.clipboard.writeText(tdhInfo.merkleRoot);
                          setMerkleRootCopied(true);
                          setTimeout(() => {
                            setMerkleRootCopied(false);
                          }, 1500);
                        }}
                      />
                    </Tippy>
                  </span>
                </div>
              </div>
              <Button
                variant="primary"
                disabled={isRunningTDH}
                onClick={calculateTDHNow}>
                Recalculate
              </Button>
            </div>
          ) : (
            <span>No TDH info</span>
          )}
        </Col>
      </Row>
    </Container>
  );
}
