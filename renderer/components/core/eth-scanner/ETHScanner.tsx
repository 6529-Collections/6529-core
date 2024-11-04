import styles from "./ETHScanner.module.scss";
import { Button, Col, Container, Row } from "react-bootstrap";
import { useState, useEffect } from "react";
import DotLoader from "../../dotLoader/DotLoader";
import {
  ScheduledWorkerNames,
  ScheduledWorkerStatus,
} from "../../../../shared/types";
import Link from "next/link";
import { Task, WorkerCard, WorkerCards } from "./Workers";
import { RPCProvider, RPCProviderAdd, RPCProviderCards } from "./RpcProviders";
import { AddRpcProviderModal } from "./RpcProviderModal";
import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Tippy from "@tippyjs/react";
import { manualStartWorker } from "../../../electron";
import { useToast } from "../../../contexts/ToastContext";

interface TDHInfo {
  block: number;
  blockTimestamp: number;
  merkleRoot: string;
  lastCalculation: number;
}

export default function ETHScanner() {
  const [fetchingTasks, setFetchingTasks] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [rpcProviders, setRpcProviders] = useState<RPCProvider[]>([]);

  const [homeDir, setHomeDir] = useState<string>("");

  const [showAddRpcProviderModal, setShowAddRpcProviderModal] = useState(false);

  const [tdhInfo, setTdhInfo] = useState<TDHInfo>();

  const fetchContent = () => {
    window.api
      .getScheduledWorkers()
      .then(({ homeDir, rpcProviders, tasks }) => {
        setHomeDir(homeDir);
        setRpcProviders(rpcProviders);
        setTasks(tasks);
        setFetchingTasks(false);
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
      setTasks((tasks) =>
        tasks.map((task) =>
          task.namespace === namespace
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
        )
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
        <Row>
          <Col className="d-flex align-items-center justify-content-between">
            <h1 className="float-none">
              <span className="font-lightest">ETH</span> Scanner
            </h1>
            <Link
              href="/core/eth-scanner/faq"
              className="font-larger decoration-hover-underline">
              FAQ
            </Link>
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
                <h3>
                  <span className="font-lightest">RPC</span> Providers
                </h3>
                <RPCProviderAdd
                  onClick={() => setShowAddRpcProviderModal(true)}
                />
              </Col>
            </Row>
            <Row className="pt-2">
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
                <WorkerCards
                  homeDir={homeDir}
                  rpcProviders={rpcProviders}
                  tasks={tasks}
                />
              </Col>
            </Row>
            <TDHInfoCard
              tdhInfo={tdhInfo}
              isRunningTDH={
                tasks?.find(
                  (task) => task.namespace === ScheduledWorkerNames.TDH_WORKER
                )?.status?.status === ScheduledWorkerStatus.RUNNING ?? false
              }
            />
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

function TDHInfoCard({
  tdhInfo,
  isRunningTDH,
}: {
  tdhInfo?: TDHInfo;
  isRunningTDH: boolean;
}) {
  const { showToast } = useToast();

  const [merkleRootCopied, setMerkleRootCopied] = useState(false);

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
      <Row>
        <Col>
          <Container className={styles.logCard}>
            <Row>
              <Col>
                {tdhInfo ? (
                  <div className="d-flex gap-3 justify-content-between align-items-center">
                    <div className="d-flex flex-column gap-1">
                      <div className="d-flex gap-3">
                        <span>
                          Block:{" "}
                          <span className={styles.progress}>
                            {tdhInfo.block}
                          </span>
                        </span>
                        <span>
                          Last Calculation:{" "}
                          <span className={styles.progress}>
                            {new Date(
                              tdhInfo.lastCalculation * 1000
                            ).toLocaleString()}
                          </span>
                        </span>
                      </div>
                      <div className="mt-3 d-flex align-items-center gap-2">
                        Merkle Root:{" "}
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
                            height={20}
                            onClick={() => {
                              navigator.clipboard.writeText(tdhInfo.merkleRoot);
                              setMerkleRootCopied(true);
                              setTimeout(() => {
                                setMerkleRootCopied(false);
                              }, 1500);
                            }}
                          />
                        </Tippy>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      disabled={isRunningTDH}
                      onClick={calculateTDHNow}>
                      Calculate Now
                    </Button>
                  </div>
                ) : (
                  <span>No TDH info</span>
                )}
              </Col>
            </Row>
          </Container>
        </Col>
      </Row>
    </>
  );
}
