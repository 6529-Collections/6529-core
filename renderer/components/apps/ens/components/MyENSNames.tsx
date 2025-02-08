import { useEffect, useState } from "react";
import { Card, Table } from "react-bootstrap";
import { useEnsName, usePublicClient } from "wagmi";
import { mainnet } from "wagmi/chains";
import styles from "./MyENSNames.module.scss";
import DotLoader from "../../../dotLoader/DotLoader";

interface Props {
  address: string;
}

interface ENSName {
  name: string;
  expiry: number;
  isController: boolean;
}

export function MyENSNames({ address }: Props) {
  const [names, setNames] = useState<ENSName[]>([]);
  const [loading, setLoading] = useState(true);
  const publicClient = usePublicClient();

  useEffect(() => {
    async function fetchNames() {
      try {
        // This is a placeholder - in real implementation we'd query the ENS subgraph
        // or use ENS SDK to get all names owned by the address
        setNames([]);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching ENS names:", error);
        setLoading(false);
      }
    }

    fetchNames();
  }, [address, publicClient]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <DotLoader />
      </div>
    );
  }

  if (names.length === 0) {
    return (
      <Card className={styles.emptyCard}>
        <Card.Body>
          <p className={styles.emptyMessage}>
            You don't own any ENS names yet.
          </p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className={styles.namesCard}>
      <Card.Body>
        <Table responsive className={styles.namesTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Expiry</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {names.map((name) => (
              <tr key={name.name}>
                <td>{name.name}</td>
                <td>{new Date(name.expiry * 1000).toLocaleDateString()}</td>
                <td>
                  <button className={styles.actionButton}>Manage</button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}
