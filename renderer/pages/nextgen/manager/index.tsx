import styles from "@/styles/Home.module.scss";
import { Container, Row, Col } from "react-bootstrap";
import dynamic from "next/dynamic";
import { useTitle } from "@/contexts/TitleContext";
import { SEIZE_URL } from "@/electron-constants";

const NextGenAdminComponent = dynamic(
  () => import("@/components/nextGen/admin/NextGenAdmin"),
  {
    ssr: false,
  }
);

export default function NextGenAdmin() {
  const { setTitle } = useTitle();
  setTitle("NextGen Admin");

  return (
    <main className={styles.main}>
      <Container fluid className={`${styles.main}`}>
        <Row>
          <Col>
            <NextGenAdminComponent />
          </Col>
        </Row>
      </Container>
    </main>
  );
}

NextGenAdmin.metadata = {
  title: "NextGen Admin",
  ogImage: `${SEIZE_URL}/nextgen.png`,
  description: "NextGen",
};
