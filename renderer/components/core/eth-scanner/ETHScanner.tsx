"use client";

import DotLoader from "@/components/dotLoader/DotLoader";
import { ScheduledWorkerNames, ScheduledWorkerStatus } from "@/shared/types";
import { useEffect, useState } from "react";
import { Col, Container, Row } from "react-bootstrap";
import { AddRpcProviderModal } from "./RpcProviderModal";
import { RPCProvider, RPCProviderAdd, RPCProviderCards } from "./RpcProviders";
import { Task, WorkerCards } from "./Workers";

export default function ETHScanner() {
  const [fetchingTasks, setFetchingTasks] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rpcProviders, setRpcProviders] = useState<RPCProvider[]>([]);

  const [showAddRpcProviderModal, setShowAddRpcProviderModal] = useState(false);

  const fetchContent = () => {
    window.api.getScheduledWorkers().then(({ rpcProviders, tasks }) => {
      setRpcProviders(rpcProviders);
      setTasks(
        tasks.filter(
          (t: Task) => t.namespace !== ScheduledWorkerNames.TDH_WORKER
        )
      );
      setFetchingTasks(false);
    });
  };

  useEffect(() => {
    fetchContent();
  }, []);

  useEffect(() => {
    const updateWorkerState = (
      namespace: string,
      status: ScheduledWorkerStatus,
      message: string,
      action?: string,
      statusPercentage?: number
    ) => {
      setTasks((tasks: Task[]) =>
        tasks.map((task: Task) =>
          task.namespace === namespace
            ? {
                ...task,
                status: {
                  status,
                  message,
                  action: action || "",
                  statusPercentage: statusPercentage || 0,
                },
              }
            : task
        )
      );
    };
    window.api.onWorkerUpdate(updateWorkerState);
    return () => {
      window.api.offWorkerUpdate(updateWorkerState);
    };
  }, []);

  return (
    <>
      <Container className="pt-5 pb-5">
        <Row>
          <Col className="d-flex align-items-center justify-content-between">
            <h1 className="float-none">
              <span className="font-lightest">ETH</span> Transactions
            </h1>
          </Col>
        </Row>
        {fetchingTasks ? (
          <Row className="pt-3">
            <Col>
              Fetching <DotLoader />
            </Col>
          </Row>
        ) : (
          <>
            <Row className="pt-5">
              <Col className="d-flex align-items-center gap-3 justify-content-between">
                <h3 className="mb-0">
                  <span className="font-lightest">RPC</span> Providers
                </h3>
                <RPCProviderAdd
                  onClick={() => setShowAddRpcProviderModal(true)}
                />
              </Col>
            </Row>
            <Row className="pt-3">
              <RPCProviderCards
                rpcProviders={rpcProviders}
                onRefresh={fetchContent}
              />
            </Row>
            <Row className="pt-5">
              <Col>
                <h3 className="float-none">
                  <span className="font-lightest">App</span> Workers
                </h3>
              </Col>
            </Row>
            <Row className="pt-2">
              <Col>
                <WorkerCards rpcProviders={rpcProviders} tasks={tasks} />
              </Col>
            </Row>
          </>
        )}
      </Container>
      <AddRpcProviderModal
        show={showAddRpcProviderModal}
        onHide={(refresh) => {
          setShowAddRpcProviderModal(false);
          if (refresh) {
            fetchContent();
          }
        }}
      />
    </>
  );
}
