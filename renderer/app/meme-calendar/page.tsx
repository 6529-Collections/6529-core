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
    <main className={styles["main"]}>
      <div className="tw-relative tw-mx-auto tw-px-2 lg:tw-px-6 xl:tw-px-8">
        <Container className="tw-pb-8 tw-pt-6">
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
