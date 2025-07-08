"use client";

import { Col, Container, Row } from "react-bootstrap";
import { useState, useEffect } from "react";
import DotLoader from "@/components/dotLoader/DotLoader";
import { ScheduledWorkerNames, ScheduledWorkerStatus } from "@/shared/types";
import { Task, TDHInfo, WorkerCard } from "../eth-scanner/Workers";
import TDHValidation from "./TDHValidation";

export default function TDHCalculation() {
  const [fetchingTask, setFetchingTask] = useState(true);
  const [tdhTask, setTdhTask] = useState<Task>();

  const [fetchingTdhInfo, setFetchingTdhInfo] = useState(true);
  const [tdhInfo, setTdhInfo] = useState<TDHInfo>();

  const fetchContent = () => {
    window.api.getScheduledWorkers().then(({ tasks }) => {
      setTdhTask(
        tasks.find((t: Task) => t.namespace === ScheduledWorkerNames.TDH_WORKER)
      );
      setFetchingTask(false);
    });
  };

  const fetchTdhInfo = () => {
    window.localDb.getTdhInfo().then((tdhInfo: TDHInfo) => {
      setTdhInfo(tdhInfo);
      setFetchingTdhInfo(false);
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
      <Container className="pt-5 pb-5">
        <Row className="pb-3">
          <Col className="d-flex align-items-center justify-content-between">
            <h1 className="float-none">
              <span className="font-lightest">TDH</span> Calculation
            </h1>
          </Col>
        </Row>
        <Row className="pt-3 pb-3">
          <Col xs={12}>
            <h4>TDH Consensus</h4>
          </Col>
          <Col xs={12}>
            6529 Core nodes calculate TDH independently. This is the core
            decentralized consensus algorithm of the protocol.
          </Col>
        </Row>
        <Row className="pt-3 pb-3">
          <Col xs={12}>
            <h4>TDH (TestNet Mode Phase 1)</h4>
          </Col>
          <Col xs={12}>
            6529 Core is currently running in testnet mode phase 1. During this
            phase, you can compare your node's TDH calculation with the
            reference 6529.io calculation. Once 6529 Core enters phase 2, TDH
            will reach consensus solely among the nodes.
          </Col>
        </Row>
        {fetchingTdhInfo ? (
          <Row className="pt-3 pb-3">
            <Col>
              Fetching local TDH Info <DotLoader />
            </Col>
          </Row>
        ) : (
          <Row className="pt-3 pb-3">
            <Col>
              <TDHValidation localInfo={tdhInfo} />
            </Col>
          </Row>
        )}
        {fetchingTask ? (
          <Row className="pt-3">
            <Col>
              Fetching TDH Task <DotLoader />
            </Col>
          </Row>
        ) : tdhTask ? (
          <Row className="pt-2">
            <Col>
              <WorkerCard
                task={tdhTask}
                customStatus={
                  tdhInfo &&
                  `Last Calculation: ${new Date(
                    tdhInfo.lastCalculation * 1000
                  ).toLocaleString()}`
                }
              />
            </Col>
          </Row>
        ) : (
          <Row className="pt-3">
            <Col>Could not find TDH Worker</Col>
          </Row>
        )}
      </Container>
    </>
  );
}
