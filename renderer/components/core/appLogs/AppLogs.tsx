import { Button, Col, Container, Row } from "react-bootstrap";
import { useState, useEffect } from "react";
import Image from "next/image";
import DotLoader from "../../dotLoader/DotLoader";
import { Time } from "../../../helpers/time";
import { UpdateImage } from "../appInfo/AppInfo";

export default function Logs() {
  const [fetchingCrashReports, setFetchingCrashReports] = useState(true);
  const [crashReports, setCrashReports] = useState<
    {
      fileName: string;
      date: number;
    }[]
  >([]);

  useEffect(() => {
    window.api.getCrashReports().then((reports) => {
      setCrashReports(reports);
      setFetchingCrashReports(false);
    });
  }, []);

  return (
    <Container className="pt-5 pb-5">
      <Row>
        <Col>
          <h1 className="float-none">
            <span className="font-lightest">App</span> Logs
          </h1>
        </Col>
      </Row>
      <Row className="pt-3">
        <Col>
          <Button
            variant="primary"
            onClick={() => window.api.send("open-logs")}>
            Open Logs Window
          </Button>
        </Col>
      </Row>
      <Row className="pt-5">
        <Col>
          <h1 className="float-none">
            <span className="font-lightest">Crash</span> Reports
          </h1>
        </Col>
      </Row>
      {fetchingCrashReports ? (
        <>
          Fetching <DotLoader />
        </>
      ) : crashReports.length === 0 ? (
        <>
          <Row>
            <Col className="d-flex align-items-center gap-3">
              <UpdateImage
                src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/5.GIF"
                alt="no-crash"
              />
              <span>No crash reports found!</span>
            </Col>
          </Row>
        </>
      ) : (
        crashReports.map((report) => (
          <Row key={report.fileName} className="pt-2 pb-2">
            <Col className="d-flex align-items-center gap-3">
              <span>{Time.millis(report.date).toIsoDateTimeString()}</span>
              <span>{report.fileName}</span>
              <Button
                variant="primary"
                size="sm"
                className="btn-link"
                onClick={() => window.api.showCrashReport(report.fileName)}>
                view
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="btn-link"
                onClick={() => window.api.extractCrashReport(report.fileName)}>
                extract
              </Button>
            </Col>
          </Row>
        ))
      )}
    </Container>
  );
}
