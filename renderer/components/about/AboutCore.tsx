import { Button, Col, Container, Row } from "react-bootstrap";
import { useState, useEffect } from "react";
import DotLoader from "../dotLoader/DotLoader";
import Image from "next/image";

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

export default function AboutCore() {
  const [info, setInfo] = useState<any>({});

  const [checkingForUpdates, setCheckingForUpdates] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo>();
  const [updateDownloaded, setUpdateDownloaded] = useState<UpdateInfo>();
  const [updateNotAvailable, setUpdateNotAvailable] = useState<UpdateInfo>();
  const [updateProgress, setUpdateProgress] = useState<ProgressInfo>();
  const [updateError, setUpdateError] = useState<any>();

  useEffect(() => {
    window.api.getInfo().then((newInfo) => {
      setInfo(newInfo);
      window.api.checkUpdates();
    });
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

    window.api.onUpdateAvailable(handleUpdateAvailable);
    window.api.onUpdateNotAvailable(handleUpdateNotAvailable);
    window.api.onUpdateError(handleUpdateError);
    window.api.onUpdateProgress(handleUpdateProgress);
    window.api.onUpdateDownloaded(handleUpdateDownloaded);

    return () => {
      window.api.offUpdateAvailable(handleUpdateAvailable);
      window.api.offUpdateNotAvailable(handleUpdateNotAvailable);
      window.api.offUpdateError(handleUpdateError);
      window.api.offUpdateProgress(handleUpdateProgress);
      window.api.offUpdateDownloaded(handleUpdateDownloaded);
    };
  }, []);

  function printInfo(key: string, value: string) {
    return (
      <Col xs={12} className="pt-3 pb-3 d-flex flex-column pb-3 text-center">
        <span>{key}</span>
        <span className="font-larger font-bolder">{value}</span>
      </Col>
    );
  }

  return (
    <Container>
      <Row>
        <Col className="text-center">
          <h1 className="float-none">
            <span className="font-lightest">6529</span> Core
          </h1>
        </Col>
      </Row>
      <Row className="pt-3">
        {printInfo("APP VERSION", info.app_version)}
        {printInfo("APP PORT", `:${info.port}`)}
        {printInfo("OS", `${info.os}:${info.arch}`)}
        {printInfo("PROTOCOL", `${info.scheme}`)}
      </Row>
      <Row className="pt-5">
        <Col xs={12} className="text-center">
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
        </Col>
      </Row>
    </Container>
  );
}

function UpdateAvailable(props: Readonly<{ info: UpdateInfo }>) {
  function handleUpdate() {
    window.api.downloadUpdate();
  }

  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="pt-3 pb-3 text-center">
          <Image
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/120.WEBP"
            alt="update"
            width={60}
            height={90}
          />
        </Col>
        <Col xs={12} className="pb-3 text-center">
          New Update Available!
        </Col>
        <Col xs={12} sm={{ span: 8, offset: 2 }} md={{ span: 6, offset: 3 }}>
          <Button
            variant="primary"
            onClick={handleUpdate}
            className="btn-block pt-2 pb-2 font-bolder">
            Seize v{props.info.version}
          </Button>
        </Col>
      </Row>
    </Container>
  );
}

function UpdateNotAvailable(props: Readonly<{ info: UpdateInfo }>) {
  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="pt-3 pb-3 text-center">
          <Image
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/1.WEBP"
            alt="update"
            width={60}
            height={90}
          />
        </Col>
        <Col xs={12} className="pb-3 text-center">
          You are running the latest version!
        </Col>
      </Row>
    </Container>
  );
}

function UpdateDownloaded(props: Readonly<{ info: UpdateInfo }>) {
  function handleInstall() {
    window.api.installUpdate();
  }

  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="pt-3 pb-3 text-center">
          Update Downloaded!
        </Col>
        <Col xs={12} sm={{ span: 8, offset: 2 }} md={{ span: 6, offset: 3 }}>
          <Button
            variant="primary"
            onClick={handleInstall}
            className="btn-block pt-2 pb-2 font-bolder">
            Install v{props.info.version}
          </Button>
        </Col>
      </Row>
    </Container>
  );
}

function UpdateError(
  props: Readonly<{ error: { name: string; messsage: string; stack: string } }>
) {
  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="d-flex flex-column gap-2 align-items-center">
          <Image
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/28.GIF"
            alt="error"
            width={22}
            height={40}
          />
          <span>Something went wrong</span>
          <span className="font-larger">{props.error.stack}</span>
        </Col>
      </Row>
    </Container>
  );
}

function UpdateProgress(props: Readonly<{ progress: ProgressInfo }>) {
  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="d-flex flex-column gap-2 align-items-center">
          <Image
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/217.GIF"
            alt="error"
            width={66}
            height={90}
          />
          <span>Downloading Update</span>
          <span className="font-larger">{props.progress.percent} / 100</span>
        </Col>
      </Row>
    </Container>
  );
}
