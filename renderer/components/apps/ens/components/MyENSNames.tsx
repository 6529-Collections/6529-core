// components/MyENSNames.tsx
import { useEffect, useState } from "react";
import { Card, Table } from "react-bootstrap";
import { usePublicClient, useChainId } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import styles from "./MyENSNames.module.scss";

// Minimal GraphQL query to fetch .eth registrations by the owner's address
const ENS_SUBGRAPH_MAINNET =
  "https://api.thegraph.com/subgraphs/name/ensdomains/ens";
const ENS_SUBGRAPH_SEPOLIA = "";
// If there's no official subgraph for Sepolia, you can skip or rely on test data

interface Props {
  address: string;
}

interface ENSRegistration {
  id: string; // A unique subgraph entry
  labelName: string; // The "name" portion (without .eth)
  expiryDate: string;
}

export function MyENSNames({ address }: Props) {
  const chainId = Number(useChainId());
  const [names, setNames] = useState<ENSRegistration[]>([]);
  const [loading, setLoading] = useState(true);

  const subgraphUrl =
    chainId === mainnet.id
      ? ENS_SUBGRAPH_MAINNET
      : chainId === sepolia.id
      ? ENS_SUBGRAPH_SEPOLIA
      : ""; // Could handle other testnets or default

  useEffect(() => {
    if (!address || !subgraphUrl) {
      setLoading(false);
      return;
    }

    async function fetchENSNames() {
      setLoading(true);
      try {
        const query = `
          query getRegistrations($owner: String!) {
            registrations(
              where: { registrant: $owner }
              first: 50
              orderBy: expiryDate
              orderDirection: desc
            ) {
              id
              labelName
              expiryDate
            }
          }
        `;

        const response = await fetch(subgraphUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            variables: { owner: address.toLowerCase() },
          }),
        });

        const { data } = await response.json();
        if (data && data.registrations) {
          setNames(data.registrations);
        }
      } catch (err) {
        console.error("Error fetching ENS data from subgraph:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchENSNames();
  }, [address, subgraphUrl]);

  if (!subgraphUrl) {
    return (
      <Card className={styles.emptyCard}>
        <Card.Body>
          <p className={styles.emptyMessage}>
            No subgraph available for this chain (Chain ID: {chainId}). Please
            switch to mainnet to see your .eth names.
          </p>
        </Card.Body>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={styles.emptyCard}>
        <Card.Body>
          <p>Loading your ENS names...</p>
        </Card.Body>
      </Card>
    );
  }

  if (names.length === 0) {
    return (
      <Card className={styles.emptyCard}>
        <Card.Body>
          <p className={styles.emptyMessage}>
            You don't own any ENS names on this network.
          </p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className={styles.namesCard}>
      <Card.Body>
        <h5>Your ENS Names</h5>
        <Table responsive className={styles.namesTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Expiry</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {names.map((item) => {
              const domainName = `${item.labelName}.eth`;
              const expiryDate = new Date(Number(item.expiryDate) * 1000);
              return (
                <tr key={item.id}>
                  <td>{domainName}</td>
                  <td>{expiryDate.toLocaleDateString()}</td>
                  <td>
                    <button className={styles.actionButton}>Manage</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
