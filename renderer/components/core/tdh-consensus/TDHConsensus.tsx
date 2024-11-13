import { Col, Container, Row } from "react-bootstrap";
import { useState, useEffect } from "react";
import DotLoader from "../../dotLoader/DotLoader";
import {
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
} from "../../../../shared/types";
import Link from "next/link";
import {
  Task,
  TDHInfo,
  TDHWorkerCard,
  WorkerCard,
} from "../eth-scanner/Workers";
import { manualStartWorker } from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";
import TDHValidation from "./TDHValidation";

export default function TDHConsensus() {
  const [fetchingTask, setFetchingTask] = useState(true);
  const [tdhTask, setTdhTask] = useState<Task>();

  const [homeDir, setHomeDir] = useState<string>("");

  const [tdhInfo, setTdhInfo] = useState<TDHInfo>();

  const fetchContent = () => {
    window.api
      .getScheduledWorkers()
      .then(({ homeDir, rpcProviders, tasks }) => {
        setHomeDir(homeDir);
        setTdhTask(
          tasks.find(
            (t: Task) => t.namespace === ScheduledWorkerNames.TDH_WORKER
          )
        );
        setFetchingTask(false);
      });
  };

  const fetchTdhInfo = () => {
    window.api.getTdhInfo().then((tdhInfo) => {
      setTdhInfo(tdhInfo);
    });
  };

  useEffect(() => {
    fetchContent();
    fetchTdhInfo();
  }, []);

  useEffect(() => {
    const updateWorkerState = (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      progress?: number,
      target?: number,
      statusPercentage?: number
    ) => {
      setTdhTask((task) =>
        task?.namespace === namespace
          ? {
              ...task,
              status: {
                status,
                message,
                action,
                progress,
                target,
                statusPercentage,
              },
            }
          : task
      );

      if (
        status === ScheduledWorkerStatus.COMPLETED &&
        namespace === ScheduledWorkerNames.TDH_WORKER
      ) {
        fetchTdhInfo();
      }
    };
    window.api.onWorkerUpdate(updateWorkerState);
    return () => {
      window.api.offWorkerUpdate(updateWorkerState);
    };
  }, []);

  return (
    <>
      <Container className="pt-5 pb-3">
        <Row>
          <Col className="d-flex align-items-center justify-content-between">
            <h1 className="float-none">
              <span className="font-lightest">TDH</span> Consensus
            </h1>
            <Link
              href="/core/tdh-consensus/faq"
              className="font-larger decoration-hover-underline">
              FAQ
            </Link>
          </Col>
        </Row>
        {fetchingTask ? (
          <Row className="pt-3">
            <Col>
              Fetching <DotLoader />
            </Col>
          </Row>
        ) : tdhTask ? (
          <>
            <Row className="pt-5">
              <Col>
                <h3 className="float-none">
                  <span className="font-lightest">TDH</span> Worker
                </h3>
              </Col>
            </Row>
            <Row className="pt-2">
              <Col>
                <WorkerCard homeDir={homeDir} task={tdhTask} />
              </Col>
            </Row>
            <TDHInfoCard
              tdhInfo={tdhInfo}
              isRunningTDH={
                tdhTask?.status?.status === ScheduledWorkerStatus.RUNNING ??
                false
              }
            />
          </>
        ) : (
          <Row className="pt-3">
            <Col>Could not find TDH Worker</Col>
          </Row>
        )}
      </Container>
      <Container className="pt-5 pb-5">
        <Row>
          <Col>
            <h3 className="float-none">
              <span className="font-lightest">TDH</span> Validation
            </h3>
          </Col>
        </Row>
        <Row className="pt-2">
          <Col>
            <TDHValidation localInfo={tdhInfo} />
          </Col>
        </Row>
      </Container>
    </>
  );
}

function TDHInfoCard({
  tdhInfo,
  isRunningTDH,
}: {
  tdhInfo?: TDHInfo;
  isRunningTDH: boolean;
}) {
  const { showToast } = useToast();

  const calculateTDHNow = async () => {
    const status = await manualStartWorker(ScheduledWorkerNames.TDH_WORKER);
    if (status.error) {
      showToast(`Error Starting TDH Worker - ${status.data}`, "error");
    } else {
      showToast(`TDH Worker Started!`, "success");
    }
  };

  return (
    <>
      <Row className="pt-5">
        <Col>
          <h3 className="float-none">
            <span className="font-lightest">App</span> TDH
          </h3>
        </Col>
      </Row>
      <Row className="pt-2">
        <Col>
          <TDHWorkerCard
            tdhInfo={tdhInfo}
            isRunningTDH={isRunningTDH}
            calculateTDHNow={calculateTDHNow}
          />
        </Col>
      </Row>
    </>
  );
}
