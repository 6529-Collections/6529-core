import styles from "./ETHScanner.module.scss";

import { Container, Row, Col, Button } from "react-bootstrap";
import { RPCProvider } from "./RpcProviders";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import useIsMobileScreen from "../../../hooks/isMobileScreen";
import CircleLoader from "../../distribution-plan-tool/common/CircleLoader";

export interface Task {
  namespace: string;
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
  const name = task.namespace
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

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
                      <span className="font-bolder font-larger">{name}</span>
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
                      onClick={() => window.api.openLogs(name, task.logFile)}>
                      <span className="font-smaller">View Logs</span>
                    </Button>
                  </span>
                </Col>
              </Row>
              <Row className="pt-1">
                <Col className="d-flex align-items-center justify-content-between"></Col>
              </Row>
            </Container>
          </Col>
        </Col>
      </Row>
    </Container>
  );
}
