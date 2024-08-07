import { Col, Container, Row } from "react-bootstrap";
import styles from "./About.module.scss";
import { openInExternalBrowser } from "../../helpers";

interface Props {
  html: string;
}

export default function AboutGDRC1(props: Readonly<Props>) {
  return (
    <Container>
      <Row>
        <Col>
          <h1 className="float-none">
            <span className="font-lightest">Global</span> Digital Rights Charter
          </h1>
        </Col>
      </Row>
      <Row>
        <Col className="pt-2 pb-2">
          We support{" "}
          <a
            href="#"
            onClick={() =>
              openInExternalBrowser("https://digitalrightscharter.org/")
            }>
            The Global Digital Rights Charter 1
          </a>
          .
          <br />
          <br />
          Full text of the GDRC 1 is below.
        </Col>
      </Row>
      <Row className="pt-1 pb-3">
        <Col
          className={styles.htmlContainer}
          dangerouslySetInnerHTML={{
            __html: props.html,
          }}></Col>
      </Row>
    </Container>
  );
}
