// ENSApp.tsx
import { useState } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { useAccount } from "wagmi";
import { SearchBar } from "./components/SearchBar";
import { MyENSNames } from "./components/MyENSNames";
import { ENSDetails } from "./components/ENSDetails";

export default function ENSApp() {
  const { address, isConnected } = useAccount();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "manage">("search");

  return (
    <Container fluid className="tw-max-w-screen-xl tw-mx-auto tw-px-4 tw-py-8">
      <Row className="tw-justify-center">
        <Col xs={12} className="tw-text-center tw-mb-12">
          <h1 className="tw-text-4xl tw-font-bold tw-text-white tw-mb-2">
            Ethereum Name Service
          </h1>
          <p className="tw-text-xl tw-text-zinc-300">
            Search, register, and manage ENS names
          </p>
        </Col>
      </Row>

      <Row className="tw-justify-center tw-mb-8">
        <Col xs={12} md={8} lg={6} className="tw-flex tw-justify-center">
          <div className="tw-inline-flex tw-border tw-border-zinc-800 tw-rounded-md tw-overflow-hidden">
            <button
              className={`tw-px-8 tw-py-3 tw-text-base tw-font-medium tw-transition-all ${
                activeTab === "search"
                  ? "tw-bg-zinc-800 tw-text-white"
                  : "tw-bg-zinc-900 tw-text-zinc-400 hover:tw-text-white"
              }`}
              onClick={() => setActiveTab("search")}
            >
              Search
            </button>

            <button
              className={`tw-px-8 tw-py-3 tw-text-base tw-font-medium tw-transition-all ${
                activeTab === "manage"
                  ? "tw-bg-zinc-800 tw-text-white"
                  : `tw-bg-zinc-900 tw-text-zinc-400 ${
                      !isConnected
                        ? "tw-opacity-50 tw-cursor-not-allowed"
                        : "hover:tw-text-white"
                    }`
              }`}
              onClick={() => isConnected && setActiveTab("manage")}
              disabled={!isConnected}
              title={!isConnected ? "Connect wallet to manage names" : ""}
            >
              My Names
            </button>
          </div>
        </Col>
      </Row>

      <Row className="tw-justify-center">
        <Col xs={12} md={8} lg={6}>
          {/* Tab Content */}
          <div className="tw-bg-zinc-900/30 tw-backdrop-blur-sm tw-rounded-lg tw-border tw-border-zinc-800/50 tw-p-6 tw-shadow-lg">
            {activeTab === "search" && (
              <div className="tw-animate-fadeIn">
                <SearchBar onSearch={setSearchQuery} />
                {searchQuery && <ENSDetails ensName={searchQuery} />}
              </div>
            )}

            {activeTab === "manage" && isConnected && (
              <div className="tw-animate-fadeIn">
                <MyENSNames address={address!} />
              </div>
            )}

            {activeTab === "manage" && !isConnected && (
              <div className="tw-bg-zinc-800/30 tw-rounded-lg tw-p-6 tw-text-center tw-text-zinc-300">
                <p className="tw-text-lg">
                  Please connect your wallet to manage your ENS names.
                </p>
              </div>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}
