// ENSApp.tsx
import { useState } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { useAccount } from "wagmi";
import { SearchBar } from "./components/SearchBar";
import { ENSDetails } from "./components/ENSDetails";
import { MyENSNames } from "./components/MyENSNames";

type TabType = "search" | "myNames";

export default function ENSApp() {
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<TabType>("search");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <Container fluid className="tw-max-w-screen-xl tw-mx-auto tw-px-4 tw-py-8">
      {/* Header Section */}
      <Row className="tw-justify-center">
        <Col xs={12} className="tw-text-center tw-mb-8">
          <h1 className="tw-text-4xl tw-font-bold tw-text-white tw-mb-2">
            Ethereum Name Service
          </h1>
          <p className="tw-text-xl tw-text-zinc-300">
            Search, register, and manage ENS names
          </p>
        </Col>
      </Row>

      {/* Tab Navigation - Updated to match app theme */}
      <Row className="tw-justify-center tw-mb-6">
        <Col xs={12} md={8} lg={6}>
          <div className="tw-grid tw-grid-cols-2 tw-gap-0 tw-border tw-border-zinc-700 tw-rounded">
            <button
              onClick={() => setActiveTab("search")}
              className={`tw-py-3 tw-px-4 tw-font-medium tw-transition-colors ${
                activeTab === "search"
                  ? "tw-bg-zinc-800 tw-text-white"
                  : "tw-bg-zinc-900 tw-text-zinc-400 hover:tw-text-zinc-200"
              } ${
                activeTab === "search" ? "tw-border-r tw-border-zinc-700" : ""
              }`}
            >
              Search ENS
            </button>
            <button
              onClick={() => setActiveTab("myNames")}
              disabled={!isConnected}
              className={`tw-py-3 tw-px-4 tw-font-medium tw-transition-colors ${
                activeTab === "myNames"
                  ? "tw-bg-zinc-800 tw-text-white"
                  : "tw-bg-zinc-900 tw-text-zinc-400 hover:tw-text-zinc-200"
              } ${!isConnected ? "tw-opacity-50 tw-cursor-not-allowed" : ""}`}
            >
              My ENS Names
            </button>
          </div>
        </Col>
      </Row>

      {/* Content Area */}
      <Row className="tw-justify-center">
        <Col xs={12} md={8} lg={6}>
          <div className="tw-bg-zinc-900/30 tw-backdrop-blur-sm tw-rounded-lg tw-border tw-border-zinc-800/50 tw-p-6 tw-shadow-lg">
            <div className="tw-animate-fadeIn">
              {activeTab === "search" ? (
                <>
                  <SearchBar onSearch={setSearchQuery} />
                  {searchQuery && <ENSDetails ensName={searchQuery} />}
                </>
              ) : (
                <MyENSNames />
              )}
            </div>
          </div>
        </Col>
      </Row>
    </Container>
  );
}
