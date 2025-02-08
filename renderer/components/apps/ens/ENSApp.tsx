import { useState } from "react";
import { Container, Row, Col } from "react-bootstrap";
import { useAccount } from "wagmi";
import styles from "./ENSApp.module.scss";
import { SearchBar } from "./components/SearchBar";
import { MyENSNames } from "./components/MyENSNames";
import { ENSDetails } from "./components/ENSDetails";

export default function ENSApp() {
  const { address, isConnected } = useAccount();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "manage">("search");

  return (
    <Container fluid className={styles.ensContainer}>
      <Row className="justify-content-center">
        <Col xs={12} className="text-center mb-5">
          <h1 className={styles.title}>Ethereum Name Service</h1>
          <p className={styles.subtitle}>
            Search, register, and manage ENS names
          </p>
        </Col>
      </Row>

      <Row className="justify-content-center mb-4">
        <Col xs={12} md={8} lg={6}>
          <div className={styles.tabContainer}>
            <button
              className={`${styles.tab} ${
                activeTab === "search" ? styles.active : ""
              }`}
              onClick={() => setActiveTab("search")}
            >
              Search
            </button>

            {isConnected && (
              <button
                className={`${styles.tab} ${
                  activeTab === "manage" ? styles.active : ""
                }`}
                onClick={() => setActiveTab("manage")}
              >
                My Names
              </button>
            )}
          </div>
        </Col>
      </Row>

      <Row className="justify-content-center">
        <Col xs={12} md={8} lg={6}>
          {activeTab === "search" && (
            <>
              <SearchBar onSearch={setSearchQuery} />
              {searchQuery && <ENSDetails ensName={searchQuery} />}
            </>
          )}

          {activeTab === "manage" && isConnected && (
            <MyENSNames address={address!} />
          )}

          {activeTab === "manage" && !isConnected && (
            <div className={styles.connectPrompt}>
              <p>Please connect your wallet to manage your ENS names</p>
            </div>
          )}
        </Col>
      </Row>
    </Container>
  );
}
