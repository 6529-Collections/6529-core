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
      <Col xs={12} sm={6} md={4} className="pt-3 pb-3 d-flex flex-column pb-3">
        <span>{key}</span>
        <span className="font-larger font-bolder">{value}</span>
      </Col>
    );
  }

  return (
    <Container>
      <Row>
        <Col>
          <h1 className="float-none">
            <span className="font-lightest">6529</span> Core
          </h1>
        </Col>
      </Row>
      <Row>
        {printInfo("APP VERSION", info.app_version)}
        {printInfo("APP PORT", `:${info.port}`)}
        {printInfo("ELECTRON VERSION", info.electron_version)}
        {printInfo("CHROME VERSION", info.chrome_version)}
        {printInfo("NODE VERSION", info.node_version)}
        {printInfo("OS", `${info.os}:${info.arch}`)}
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
