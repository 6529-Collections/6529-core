"use client";

import DotLoader from "@/components/dotLoader/DotLoader";
import {
  DesktopPageHeading,
  DesktopSectionHeading,
} from "../DesktopHeadings";
import { ScheduledWorkerNames, ScheduledWorkerStatus } from "@/shared/types";
import { useEffect, useState } from "react";
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
                  ...(statusPercentage !== undefined && { statusPercentage }),
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
      <div className="tw-py-8">
        <DesktopPageHeading>ETH Transactions</DesktopPageHeading>
        {fetchingTasks ? (
          <div className="tw-pt-6">
            Fetching <DotLoader />
          </div>
        ) : (
          <>
            <div className="tw-flex tw-items-center tw-justify-between tw-gap-3 tw-pt-6">
              <DesktopSectionHeading>RPC Providers</DesktopSectionHeading>
              <RPCProviderAdd
                onClick={() => setShowAddRpcProviderModal(true)}
              />
            </div>
            <div className="tw-pt-3">
              <RPCProviderCards
                rpcProviders={rpcProviders}
                onRefresh={fetchContent}
              />
            </div>
            <div className="tw-pt-6">
              <DesktopSectionHeading>App Workers</DesktopSectionHeading>
            </div>
            <div className="tw-pt-4">
              <WorkerCards rpcProviders={rpcProviders} tasks={tasks} />
            </div>
          </>
        )}
      </div>
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
