// ENSApp.tsx
import { useState } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { useAccount } from "wagmi";
import { SearchBar } from "./components/SearchBar";
import { ENSDetails } from "./components/ENSDetails";

export default function ENSApp() {
  const { isConnected } = useAccount();
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Container fluid className="tw-max-w-screen-xl tw-mx-auto tw-px-4 tw-py-8">
      <Row className="tw-justify-center">
        <Col xs={12} className="tw-text-center tw-mb-12">
          <h1 className="tw-text-4xl tw-font-bold tw-text-white tw-mb-2">
            Ethereum Name Service
          </h1>
          <p className="tw-text-xl tw-text-zinc-300">
            Search and register ENS names
          </p>
        </Col>
      </Row>

      <Row className="tw-justify-center">
        <Col xs={12} md={8} lg={6}>
          <div className="tw-bg-zinc-900/30 tw-backdrop-blur-sm tw-rounded-lg tw-border tw-border-zinc-800/50 tw-p-6 tw-shadow-lg">
            <div className="tw-animate-fadeIn">
              <SearchBar onSearch={setSearchQuery} />
              {searchQuery && <ENSDetails ensName={searchQuery} />}
            </div>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
