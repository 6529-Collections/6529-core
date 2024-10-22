import { useState, useEffect } from "react";
import { Row, Col, Button, Container } from "react-bootstrap";
import { Time } from "../../../helpers/time";
import DotLoader from "../../dotLoader/DotLoader";
import { UpdateImage } from "../app-info/AppInfo";

export interface CrashReport {
  fileName: string;
  path: string;
  date: number;
}

export function CrashReports() {
  const [fetchingCrashReports, setFetchingCrashReports] = useState(true);
  const [crashReports, setCrashReports] = useState<CrashReport[]>([]);

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
            <span className="font-lightest">Crash</span> Reports
          </h1>
        </Col>
      </Row>
      <Row className="pt-3">
        {fetchingCrashReports ? (
          <Row>
            <Col>
              Fetching <DotLoader />
            </Col>
          </Row>
        ) : crashReports.length === 0 ? (
          <Row>
            <Col className="d-flex align-items-center gap-3">
              <UpdateImage
                src="https://d3lqz0a4bldqgf.cloudfront.net/images/scaled_x450/0x33FD426905F149f8376e227d0C9D3340AaD17aF1/5.GIF"
                alt="no-crash"
              />
              <span>No crash reports found!</span>
            </Col>
          </Row>
        ) : (
          crashReports.map((report) => (
            <Col
              key={report.fileName}
              className="d-flex align-items-center gap-3">
              <span>{Time.millis(report.date).toIsoDateTimeString()}</span>
              <span>{report.fileName}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.api.showFile(report.path)}>
                Locate
              </Button>
            </Col>
          ))
        )}
      </Row>
    </Container>
  );
}
