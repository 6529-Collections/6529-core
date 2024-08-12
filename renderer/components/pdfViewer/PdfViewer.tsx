import { useEffect, useRef, useState } from "react";
import { Col, Container, Row } from "react-bootstrap";

interface Props {
  file: string;
}

export default function PdfViewer(props: Readonly<Props>) {
  // useEffect(() => {
  //   pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  // }, []);

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [renderedPageNumber, setRenderedPageNumber] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);

  function changePage(p: number) {
    setPageNumber(p);
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const isLoading = renderedPageNumber !== pageNumber;

  return (
    <Container className="no-padding" ref={containerRef}>
      <Row>
        <Col>
          <iframe
            src={props.file}
            width="100%"
            style={{
              height: "90vh",
            }}></iframe>
        </Col>
      </Row>
    </Container>
  );
}
