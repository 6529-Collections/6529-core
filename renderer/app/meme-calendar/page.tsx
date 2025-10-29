import MemesMintingCalendar from "@/components/meme-calendar/MemesMintingCalendar";
import { getAppMetadata } from "@/components/providers/metadata";
import styles from "@/styles/Home.module.scss";
import type { Metadata } from "next";
import { Col, Container, Row } from "react-bootstrap";

export async function generateMetadata(): Promise<Metadata> {
  return getAppMetadata({ title: "Memes Minting Calendar" });
}

export default function MemesMintingCalendarPage() {
  return (
    <main className={styles.main}>
      <div className="tw-relative tw-px-2 lg:tw-px-6 xl:tw-px-8 tw-mx-auto">
        <Container className="tw-pt-6 tw-pb-8">
          <Row>
            <Col>
              <MemesMintingCalendar />
            </Col>
          </Row>
        </Container>
      </div>
    </main>
  );
}
