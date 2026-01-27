"use client";

import DotLoader from "@/components/dotLoader/DotLoader";
import { ScheduledWorkerNames, ScheduledWorkerStatus } from "@/shared/types";
import { useEffect, useState } from "react";
import { Task, TDHInfo, WorkerCard } from "../eth-scanner/Workers";
import TDHValidation from "./TDHValidation";

const tableWrapperClass =
  "tw-overflow-hidden tw-rounded-xl tw-border tw-border-iron-800 tw-bg-iron-950 tw-p-5 tw-ring-1 tw-ring-inset tw-ring-iron-800 [&_table]:tw-w-full [&_table]:tw-table-fixed [&_tbody_tr]:tw-w-full [&_td:nth-child(1)]:tw-flex-[0_0_8rem] [&_td:nth-child(2)]:tw-flex-[2_1_0%] [&_td:nth-child(3)]:tw-flex-[2_1_0%] [&_td:nth-child(4)]:tw-flex-[0_0_5rem] [&_td:nth-child(5)]:tw-flex-1 [&_td]:tw-flex [&_td]:tw-min-h-[65px] [&_td]:tw-items-center [&_td]:tw-gap-2 [&_td]:tw-p-2 [&_th:nth-child(1)]:tw-flex-[0_0_8rem] [&_th:nth-child(1)]:tw-whitespace-nowrap [&_th:nth-child(2)]:tw-flex-[2_1_0%] [&_th:nth-child(3)]:tw-flex-[2_1_0%] [&_th:nth-child(4)]:tw-flex-[0_0_5rem] [&_th:nth-child(5)]:tw-flex-1 [&_th]:tw-flex [&_th]:tw-items-center [&_th]:tw-gap-2 [&_th]:tw-p-2 [&_th]:tw-text-left [&_thead_tr]:tw-border-b [&_thead_tr]:tw-border-iron-800 [&_tr]:tw-flex [&_tr]:tw-flex-row [&_tr]:tw-items-stretch";
const shimmerBar = "tw-h-4 tw-rounded tw-bg-iron-800 tw-animate-pulse";

function TDHValidationShimmer() {
  return (
    <div className={tableWrapperClass}>
      <table>
        <thead>
          <tr>
            <th>Value</th>
            <th>Your Node</th>
            <th>6529.io</th>
            <th className="tw-justify-center">Match</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <hr className="tw-my-2 tw-w-full tw-border-0 tw-border-t tw-border-iron-700" />
          <tr>
            <td>
              <span className={`${shimmerBar} tw-w-12`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-24`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-24`} />
            </td>
            <td className="tw-justify-center">
              <span className={`${shimmerBar} tw-w-6 tw-rounded-full`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-3/4`} />
            </td>
          </tr>
          <hr className="tw-my-2 tw-w-full tw-border-0 tw-border-t tw-border-iron-700" />
          <tr>
            <td>
              <span className={`${shimmerBar} tw-w-14`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-16`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-16`} />
            </td>
            <td className="tw-justify-center">
              <span className={`${shimmerBar} tw-w-6 tw-rounded-full`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-full`} />
            </td>
          </tr>
          <hr className="tw-my-2 tw-w-full tw-border-0 tw-border-t tw-border-iron-700" />
          <tr>
            <td>
              <span className={`${shimmerBar} tw-w-20`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-full`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-full`} />
            </td>
            <td className="tw-justify-center">
              <span className={`${shimmerBar} tw-w-6 tw-rounded-full`} />
            </td>
            <td>
              <span className={`${shimmerBar} tw-w-4/5`} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function TDHCalculation() {
  const [fetchingTask, setFetchingTask] = useState(true);
  const [tdhTask, setTdhTask] = useState<Task>();

  const [fetchingTdhInfo, setFetchingTdhInfo] = useState(true);
  const [tdhInfo, setTdhInfo] = useState<TDHInfo>();

  const fetchContent = () => {
    window.api.getScheduledWorkers().then(({ tasks }: { tasks: Task[] }) => {
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
      setTdhTask((task: Task | undefined): Task | undefined =>
        task?.namespace === namespace
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
      <div className="tw-py-8">
        <h1 className="tw-m-0">
          <span className="tw-font-light tw-text-iron-400">TDH</span>{" "}
          Calculation
        </h1>
        <div className="tw-pt-6">
          <h4>TDH Consensus</h4>
          <p className="tw-m-0">
            6529 Desktop nodes calculate TDH independently. This is the core
            decentralized consensus algorithm of the protocol.
          </p>
        </div>
        <div className="tw-pt-6">
          <h4>TDH (TestNet Mode Phase 1)</h4>
          <p className="tw-m-0">
            6529 Desktop is currently running in testnet mode phase 1. During
            this phase, you can compare your node's TDH calculation with the
            reference 6529.io calculation. Once 6529 Desktop enters phase 2, TDH
            will reach consensus solely among the nodes.
          </p>
        </div>
        {fetchingTdhInfo ? (
          <div className="tw-pt-6">
            <TDHValidationShimmer />
          </div>
        ) : (
          <div className="tw-pt-6">
            <TDHValidation localInfo={tdhInfo} />
          </div>
        )}
        {fetchingTask ? (
          <div className="tw-pt-4">
            Fetching TDH Task <DotLoader />
          </div>
        ) : tdhTask ? (
          <div className="tw-pt-4">
            <WorkerCard
              task={tdhTask}
              customStatus={
                tdhInfo &&
                `Last Calculation: ${new Date(
                  tdhInfo.lastCalculation * 1000
                ).toLocaleString()}`
              }
            />
          </div>
        ) : (
          <div className="tw-pt-4">Could not find TDH Worker</div>
        )}
      </div>
    </>
  );
}
