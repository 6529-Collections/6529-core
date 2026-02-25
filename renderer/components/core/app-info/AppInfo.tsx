"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import DotLoader from "../../dotLoader/DotLoader";
import { Task } from "../eth-scanner/Workers";
import LogsViewer from "../logs-viewer/LogsViewer";

interface ProgressInfo {
  total: number;
  delta: number;
  transferred: number;
  percent: number;
  bytesPerSecond: number;
}

interface UpdateInfo {
  version: string;
}

function bytesToKB(bytes: number): string {
  return parseInt((bytes / 1024).toFixed(0)).toLocaleString();
}

function bytesToMB(bytes: number): string {
  return parseInt((bytes / (1024 * 1024)).toFixed(0)).toLocaleString();
}

export default function AppInfo() {
  const [info, setInfo] = useState<any>({});

  const [checkingForUpdates, setCheckingForUpdates] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo>();
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateInfo>();
  const [updateNotAvailable, setUpdateNotAvailable] = useState<UpdateInfo>();
  const [updateProgress, setUpdateProgress] = useState<ProgressInfo>();
  const [updateError, setUpdateError] = useState<any>();

  const [mainTask, setMainTask] = useState<Task>();

  useEffect(() => {
    window.api.getInfo().then((newInfo) => {
      setInfo(newInfo);
    });
  }, []);

  const fetchMainWorker = () => {
    window.api.getMainWorker().then(({ mainTask }) => {
      setMainTask(mainTask);
    });
  };

  useEffect(() => {
    fetchMainWorker();
    window.updater.checkUpdates();
  }, []);

  useEffect(() => {
    const handleUpdateAvailable = (_event: any, info: any) => {
      setUpdateError(false);
      setCheckingForUpdates(false);
      setUpdateNotAvailable(undefined);
      setUpdateProgress(undefined);
      setUpdateDownloaded(undefined);
      setUpdateAvailable(info);
    };

    const handleUpdateNotAvailable = (_event: any, info: any) => {
      setCheckingForUpdates(false);
      setUpdateError(false);
      setUpdateAvailable(undefined);
      setUpdateProgress(undefined);
      setUpdateDownloaded(undefined);
      setUpdateNotAvailable(info);
    };

    const handleUpdateError = (_event: any, error: any) => {
      setCheckingForUpdates(false);
      setUpdateAvailable(undefined);
      setUpdateProgress(undefined);
      setUpdateNotAvailable(undefined);
      setUpdateDownloaded(undefined);
      setUpdateError(error);
    };

    const handleUpdateProgress = (_event: any, progress: ProgressInfo) => {
      setCheckingForUpdates(false);
      setUpdateAvailable(undefined);
      setUpdateNotAvailable(undefined);
      setUpdateError(undefined);
      setUpdateDownloaded(undefined);
      setUpdateProgress(progress);
    };

    const handleUpdateDownloaded = (_event: any, info: UpdateInfo) => {
      setCheckingForUpdates(false);
      setUpdateAvailable(undefined);
      setUpdateProgress(undefined);
      setUpdateNotAvailable(undefined);
      setUpdateError(undefined);
      setUpdateDownloaded(info);
    };

    window.updater.onUpdateAvailable(handleUpdateAvailable);
    window.updater.onUpdateNotAvailable(handleUpdateNotAvailable);
    window.updater.onUpdateError(handleUpdateError);
    window.updater.onUpdateProgress(handleUpdateProgress);
    window.updater.onUpdateDownloaded(handleUpdateDownloaded);

    return () => {
      window.updater.offUpdateAvailable(handleUpdateAvailable);
      window.updater.offUpdateNotAvailable(handleUpdateNotAvailable);
      window.updater.offUpdateError(handleUpdateError);
      window.updater.offUpdateProgress(handleUpdateProgress);
      window.updater.offUpdateDownloaded(handleUpdateDownloaded);
    };
  }, []);

  function printAppVersion() {
    return (
      <div className="tw-rounded-xl tw-bg-iron-950 tw-px-5 tw-py-8 tw-ring-1 tw-ring-inset tw-ring-iron-800">
        <div className="tw-flex tw-flex-wrap tw-justify-between tw-gap-4">
          <div>
            <div className="tw-flex tw-flex-col tw-gap-0.5">
              <h4 className="tw-m-0 tw-text-xl tw-font-semibold">
                v{info.app_version}
              </h4>
              <span className="tw-text-sm tw-text-iron-400">
                {info.os}:{info.arch} / {info.scheme}
              </span>
              <span className="tw-mt-3 tw-block tw-text-sm">
                App Port: <b>{info.port}</b>
              </span>
              <span className="tw-block tw-text-sm">
                IPFS Port: <b>{info.ipfsPort}</b>
              </span>
              <span className="tw-block tw-text-sm">
                IPFS RPC Port: <b>{info.ipfsRpcPort}</b>
              </span>
              <span className="tw-block tw-text-sm">
                IPFS Swarm Port: <b>{info.ipfsSwarmPort}</b>
              </span>
            </div>
          </div>
          <span className="tw-flex tw-items-center tw-gap-2">
            {checkingForUpdates && (
              <>
                Checking For Updates <DotLoader />
              </>
            )}
            {updateProgress && <UpdateProgress progress={updateProgress} />}
            {updateAvailable && <UpdateAvailable info={updateAvailable} />}
            {updateNotAvailable && (
              <UpdateNotAvailable info={updateNotAvailable} />
            )}
            {updateError && <UpdateError error={updateError} />}
            {updateDownloaded && <UpdateDownloaded info={updateDownloaded} />}
          </span>
        </div>
      </div>
    );
  }

  function printMainWorkerLogs(filePath: string) {
    return <LogsViewer name="App Logs" filePath={filePath} width="100%" />;
  }

  return (
    <div className="tw-py-8">
      <h1 className="tw-m-0">
        <span className="tw-font-light tw-text-iron-400">6529 Desktop</span>{" "}
        About
      </h1>
      <div className="tw-mt-6">{printAppVersion()}</div>
      {mainTask?.logFile && (
        <div className="tw-mt-6">{printMainWorkerLogs(mainTask.logFile)}</div>
      )}
    </div>
  );
}

function UpdateAvailable(props: Readonly<{ info: UpdateInfo }>) {
  function handleUpdate() {
    window.updater.downloadUpdate();
  }

  return (
    <div className="tw-text-center">
      <div className="tw-pb-3">
        <UpdateImage
          src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/120.WEBP"
          alt="update"
        />
      </div>
      <div className="tw-text-center">New Version Available!</div>
      <div className="tw-mx-auto tw-mt-3 tw-max-w-xs">
        <button
          type="button"
          onClick={handleUpdate}
          className="tw-w-full tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-py-2 tw-text-base tw-font-bold tw-text-white tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 desktop-hover:hover:tw-bg-primary-600"
        >
          Seize v{props.info.version}
        </button>
      </div>
    </div>
  );
}

function UpdateNotAvailable(_props: Readonly<{ info: UpdateInfo }>) {
  return (
    <div className="tw-text-center">
      <div className="tw-pb-3">
        <UpdateImage
          src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/1.WEBP"
          alt="6529"
        />
      </div>
      <div className="tw-text-center">You are running the latest version!</div>
    </div>
  );
}

function UpdateDownloaded(_props: Readonly<{ info: UpdateInfo }>) {
  const [installing, setInstalling] = useState(false);
  function handleInstall() {
    window.updater.installUpdate();
    setInstalling(true);
  }

  return (
    <div className="tw-text-center">
      <div className="tw-pb-3">
        <UpdateImage
          src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/89.GIF"
          alt="downloaded"
        />
      </div>
      <div className="tw-text-center">New Version Downloaded!</div>
      <div className="tw-mx-auto tw-mt-3 tw-max-w-xs">
        <button
          type="button"
          disabled={installing}
          onClick={handleInstall}
          className="tw-w-full tw-cursor-pointer tw-rounded-lg tw-border-0 tw-bg-primary-500 tw-py-2 tw-text-base tw-font-bold tw-text-white tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 disabled:tw-opacity-50 desktop-hover:hover:tw-bg-primary-600"
        >
          {installing ? "Installing" : "Install!"}
        </button>
      </div>
    </div>
  );
}

function UpdateError(
  props: Readonly<{ error: { name: string; messsage: string; stack: string } }>
) {
  return (
    <div className="tw-text-center">
      <div className="tw-pb-3">
        <UpdateImage
          src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/28.GIF"
          alt="error"
        />
      </div>
      <div className="tw-text-center">Something went wrong</div>
      <div className="tw-text-center tw-text-sm tw-text-iron-400">
        {props.error.stack}
      </div>
    </div>
  );
}

function UpdateProgress(props: Readonly<{ progress: ProgressInfo }>) {
  return (
    <div className="tw-text-center">
      <div className="tw-pb-3">
        <UpdateImage
          src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/217.GIF"
          alt="progress"
        />
      </div>
      <div className="tw-text-center">Downloading Update</div>
      <div className="tw-flex tw-flex-col tw-items-center tw-gap-1 tw-pb-3 tw-text-center">
        <span className="tw-text-lg">
          {props.progress.percent.toFixed(2)} %
        </span>
        <span className="tw-text-sm">
          {bytesToKB(props.progress.bytesPerSecond)} KB per second
        </span>
        <span className="tw-text-sm">
          {bytesToMB(props.progress.transferred)}/
          {bytesToMB(props.progress.total)} Total MB
        </span>
      </div>
    </div>
  );
}

export function UpdateImage(props: Readonly<{ src: string; alt: string }>) {
  return (
    <Image
      priority
      loading="eager"
      src={props.src}
      alt={props.alt}
      width={0}
      height={0}
      style={{ height: "120px", width: "auto" }}
    />
  );
}
