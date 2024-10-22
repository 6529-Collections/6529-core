import styles from "./WorkersHub.module.scss";

import { Container, Row, Col, Button } from "react-bootstrap";
import { RPCProvider } from "./RpcProviders";
import path from "path";
import { ScheduledWorkerStatus } from "../../../../shared/types";
import useIsMobileScreen from "../../../hooks/isMobileScreen";
import CircleLoader from "../../distribution-plan-tool/common/CircleLoader";

export interface Task {
  namespace: string;
  logFile: string;
  interval: number;
  status?: {
    status: ScheduledWorkerStatus;
    message: string;
    action?: string;
    progress?: number;
    target?: number;
    statusPercentage?: number;
  };
}

export function WorkerCards({
  homeDir,
  rpcProviders,
  tasks,
}: {
  readonly homeDir?: string;
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
  readonly homeDir?: string;
  readonly task: Task;
}) {
  const name = path
    .basename(task.logFile)
    .replaceAll(".log", "")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  const printStatus = () => {
    if (!task.interval) {
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
                    {task.interval ? (
                      <span className="font-smaller font-color-h">
                        (scheduled every {task.interval} minute
                        {task.interval > 1 ? "s" : ""})
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
                    &#126;/{path.relative(homeDir ?? "", task.logFile)}
                  </span>
                  <span className="d-flex align-items-center gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => window.api.showFile(task.logFile)}>
                      Locate
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => window.api.openLogs(name, task.logFile)}>
                      Follow
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
