import { Button, Col, Container, Row } from "react-bootstrap";
import Image from "next/image";
import { openInExternalBrowser } from "../../helpers";
import { useState, useEffect } from "react";

export default function AboutCore() {
  const [info, setInfo] = useState<any>({});

  const handleCheckUpdates = () => {
    window.api.checkUpdates();
  };

  useEffect(() => {
    window.api.getInfo().then((newInfo) => {
      setInfo(newInfo);
    });
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
        <Col xs={12} sm={{ span: 8, offset: 2 }} md={{ span: 6, offset: 3 }}>
          <Button
            variant="primary"
            onClick={() => handleCheckUpdates()}
            className="btn-block pt-2 pb-2">
            Check for Updates
          </Button>
        </Col>
      </Row>
    </Container>
  );
}
