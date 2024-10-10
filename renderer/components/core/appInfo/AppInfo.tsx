import { Button, Col, Container, Row } from "react-bootstrap";
import { useState, useEffect } from "react";
import Image from "next/image";
import DotLoader from "../../dotLoader/DotLoader";

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

  useEffect(() => {
    window.api.getInfo().then((newInfo) => {
      setInfo(newInfo);
      window.updater.checkUpdates();
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

  function printInfo(key: string, value: string) {
    return (
      <Col sm={12} md={6} className="pt-2 pb-2">
        <Container>
          <Row>
            <Col
              className="pt-3 pb-3 d-flex flex-column text-center"
              style={{
                border: "1px solid #e5e5e5",
              }}>
              <span>{key}</span>
              <span className="font-larger font-bolder">{value}</span>
            </Col>
          </Row>
        </Container>
      </Col>
    );
  }

  return (
    <Container className="pt-5 pb-5">
      <Row>
        <Col>
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
    window.updater.downloadUpdate();
  }

  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="pb-3">
          <UpdateImage
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/120.WEBP"
            alt="update"
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
        <Col xs={12} className="pb-3">
          <UpdateImage
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/1.WEBP"
            alt="6529"
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
  const [installing, setInstalling] = useState(false);
  function handleInstall() {
    window.updater.installUpdate();
    setInstalling(true);
  }

  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="pb-3">
          <UpdateImage
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/89.GIF"
            alt="downloaded"
          />
        </Col>
        <Col xs={12} className="pb-3 text-center">
          Update Downloaded
        </Col>
        <Col xs={12} sm={{ span: 8, offset: 2 }} md={{ span: 6, offset: 3 }}>
          <Button
            disabled={installing}
            variant="primary"
            onClick={handleInstall}
            className="btn-block pt-2 pb-2 font-bolder">
            {installing ? "Installing" : "Install!"}
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
        <Col xs={12} className="pb-3">
          <UpdateImage
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/28.GIF"
            alt="error"
          />
        </Col>
        <Col xs={12} className="pb-3 text-center">
          Something went wrong
        </Col>
        <Col xs={12} className="pb-3 text-center">
          {props.error.stack}
        </Col>
      </Row>
    </Container>
  );
}

function UpdateProgress(props: Readonly<{ progress: ProgressInfo }>) {
  return (
    <Container className="text-center">
      <Row>
        <Col xs={12} className="pb-3">
          <UpdateImage
            src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/217.GIF"
            alt="progress"
          />
        </Col>
        <Col xs={12} className="pb-3 text-center">
          Downloading Update
        </Col>
        <Col
          xs={12}
          className="pb-3 text-center d-flex flex-column align-items-center">
          <span className="font-larger">
            {props.progress.percent.toFixed(2)} %
          </span>
          <span className="font-smaller">
            {bytesToKB(props.progress.bytesPerSecond)} KB per second
          </span>
          <span className="font-smaller">
            {bytesToMB(props.progress.transferred)}/
            {bytesToMB(props.progress.total)} Total MB
          </span>
        </Col>
      </Row>
    </Container>
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
      style={{
        height: "120px",
        width: "auto",
      }}
    />
  );
}
