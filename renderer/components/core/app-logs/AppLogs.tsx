import { Col, Container, Row } from "react-bootstrap";
import { CrashReports } from "./CrashReports";
import { Task, WorkerCard } from "../eth-scanner/Workers";
import { useEffect, useState } from "react";

export default function AppLogs() {
  const [mainTask, setMainTask] = useState<Task>();
  const [homeDir, setHomeDir] = useState<string>("");

  const fetchContent = () => {
    window.api.getMainWorker().then(({ homeDir, mainTask }) => {
      setHomeDir(homeDir);
      setMainTask(mainTask);
    });
  };

  useEffect(() => {
    fetchContent();
  }, []);

  return (
    <>
      <Container className="pt-5">
        <Row>
          <Col>
            <h1 className="float-none">
              <span className="font-lightest">App</span> Logs
            </h1>
          </Col>
        </Row>
        <Row>
          <Col>
            {mainTask && <WorkerCard homeDir={homeDir} task={mainTask} />}
          </Col>
        </Row>
      </Container>
      <CrashReports />
    </>
  );
}
