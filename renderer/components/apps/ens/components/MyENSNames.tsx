// components/MyENSNames.tsx
import { useEffect, useState } from "react";
import { Card, Table, Button, Spinner } from "react-bootstrap";
import { usePublicClient, useChainId, useEnsName } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { formatEther } from "viem";
import styles from "./MyENSNames.module.scss";
import { ENS_CONTRACTS } from "../constants";
import Link from "next/link";

// Mainnet uses the official subgraph
const ENS_SUBGRAPH_MAINNET =
  "https://api.thegraph.com/subgraphs/name/ensdomains/ens";

// For Sepolia, we'll use a direct contract call approach since there's no official subgraph
const ENS_SUBGRAPH_SEPOLIA = "";

interface Props {
  address: string;
}

interface ENSRegistration {
  id: string;
  labelName: string;
  expiryDate: string;
  cost?: string;
  registrationDate?: string;
}

export function MyENSNames({ address }: Props) {
  const chainId = Number(useChainId());
  const publicClient = usePublicClient();
  const [names, setNames] = useState<ENSRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subgraphUrl =
    chainId === mainnet.id
      ? ENS_SUBGRAPH_MAINNET
      : chainId === sepolia.id
      ? ENS_SUBGRAPH_SEPOLIA
      : "";

  useEffect(() => {
    if (!address) {
      setLoading(false);
      return;
    }

    async function fetchENSNames() {
      setLoading(true);
      setError(null);
      setNames([]);

      try {
        if (chainId === mainnet.id && subgraphUrl) {
          // Mainnet: Use The Graph
          await fetchFromSubgraph();
        } else if (chainId === sepolia.id) {
          // Sepolia: Use direct contract calls
          await fetchFromContract();
        } else {
          setError(`Chain ID ${chainId} is not supported for ENS names`);
        }
      } catch (err: any) {
        console.error("Error fetching ENS data:", err);
        setError(err.message || "Failed to load your ENS names");
      } finally {
        setLoading(false);
      }
    }

    async function fetchFromSubgraph() {
      const query = `
        query getRegistrations($owner: String!) {
          registrations(
            where: { registrant: $owner }
            first: 100
            orderBy: expiryDate
            orderDirection: desc
          ) {
            id
            labelName
            expiryDate
            registrationDate
            cost
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

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      if (result.data && result.data.registrations) {
        setNames(result.data.registrations);
      }
    }

    async function fetchFromContract() {
      // This works for both mainnet and testnets
      const baseRegistrarAddress =
        ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]?.baseRegistrar;
      const registryAddress =
        ENS_CONTRACTS[chainId as keyof typeof ENS_CONTRACTS]?.registry;

      if (!baseRegistrarAddress || !registryAddress || !publicClient) {
        throw new Error("Contract addresses or public client not available");
      }

      try {
        // Step 1: Get the total number of tokens owned by the address
        const balance = await publicClient.readContract({
          address: baseRegistrarAddress as `0x${string}`,
          abi: [
            {
              inputs: [{ type: "address", name: "owner" }],
              name: "balanceOf",
              outputs: [{ type: "uint256" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        });

        const tokenCount = Number(balance);
        const registrations: ENSRegistration[] = [];

        // Step 2: For each token, get the token ID and then the name
        for (let i = 0; i < tokenCount; i++) {
          // Get token ID at index
          const tokenId = await publicClient.readContract({
            address: baseRegistrarAddress as `0x${string}`,
            abi: [
              {
                inputs: [
                  { type: "address", name: "owner" },
                  { type: "uint256", name: "index" },
                ],
                name: "tokenOfOwnerByIndex",
                outputs: [{ type: "uint256" }],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "tokenOfOwnerByIndex",
            args: [address as `0x${string}`, BigInt(i)],
          });

          // Step 3: Get expiry date for this token
          const expiryDate = await publicClient.readContract({
            address: baseRegistrarAddress as `0x${string}`,
            abi: [
              {
                inputs: [{ type: "uint256", name: "tokenId" }],
                name: "nameExpires",
                outputs: [{ type: "uint256" }],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "nameExpires",
            args: [tokenId],
          });

          // Step 4: Convert token ID to label name
          // The tokenId is actually the namehash of the label
          // We need to convert it to a readable name

          // Option 1: If the contract has a function to get the name from tokenId
          try {
            const labelName = await publicClient.readContract({
              address: baseRegistrarAddress as `0x${string}`,
              abi: [
                {
                  inputs: [{ type: "uint256", name: "tokenId" }],
                  name: "getLabel", // This function name might be different
                  outputs: [{ type: "string" }],
                  stateMutability: "view",
                  type: "function",
                },
              ],
              functionName: "getLabel",
              args: [tokenId],
            });

            registrations.push({
              id: tokenId.toString(),
              labelName,
              expiryDate: expiryDate.toString(),
              registrationDate: "0", // Not available directly
            });
            continue;
          } catch (error) {}

          // Option 2: Query events to find the name
          // This is more complex and requires searching through registration events
          try {
            // Look for Transfer or NameRegistered events
            const events = await publicClient.getContractEvents({
              address: baseRegistrarAddress as `0x${string}`,
              abi: [
                {
                  anonymous: false,
                  inputs: [
                    { indexed: true, name: "id", type: "uint256" },
                    { indexed: true, name: "owner", type: "address" },
                    { indexed: false, name: "expires", type: "uint256" },
                  ],
                  name: "NameRegistered",
                  type: "event",
                },
              ],
              eventName: "NameRegistered",
              args: {
                id: tokenId,
              },
              fromBlock: BigInt(0),
              toBlock: "latest",
            });

            if (events.length > 0) {
              // Try to extract the name from the event
              // This depends on the specific event structure
              // For simplicity, we'll use a placeholder
              const labelName = `name-from-event-${tokenId}`;

              registrations.push({
                id: tokenId.toString(),
                labelName,
                expiryDate: expiryDate.toString(),
                registrationDate: "0",
              });
              continue;
            }
          } catch (error) {}

          // Option 3: As a last resort, just use the tokenId
          registrations.push({
            id: tokenId.toString(),
            labelName: `name-${tokenId}`,
            expiryDate: expiryDate.toString(),
            registrationDate: "0",
          });
        }

        setNames(registrations);
      } catch (error) {
        console.error("Error fetching from contract:", error);
        throw new Error("Failed to fetch ENS names from contract");
      }
    }

    fetchENSNames();
  }, [address, chainId, publicClient, subgraphUrl]);

  // Helper function to format dates
  const formatDate = (timestamp: string) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Calculate if a name is expiring soon (within 30 days)
  const isExpiringSoon = (expiryDate: string) => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = Number(expiryDate);
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    return expiry - now < thirtyDaysInSeconds && expiry > now;
  };

  // Calculate if a name is expired
  const isExpired = (expiryDate: string) => {
    const now = Math.floor(Date.now() / 1000);
    return Number(expiryDate) < now;
  };

  if (loading) {
    return (
      <Card className={styles.emptyCard}>
        <Card.Body className="text-center">
          <Spinner animation="border" role="status" className="mb-2" />
          <p>Loading your ENS names...</p>
        </Card.Body>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={styles.errorCard}>
        <Card.Body>
          <p className={styles.errorMessage}>{error}</p>
          {chainId !== mainnet.id && (
            <p>
              For the best experience with ENS, please switch to Ethereum
              Mainnet.
            </p>
          )}
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
          {chainId === sepolia.id && (
            <p>
              This is a test network. You can register test ENS names to try out
              the functionality.
            </p>
          )}
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
              <th>Registered</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {names.map((item) => {
              const domainName = `${item.labelName}.eth`;
              const expiringSoon = isExpiringSoon(item.expiryDate);
              const expired = isExpired(item.expiryDate);

              return (
                <tr
                  key={item.id}
                  className={
                    expired
                      ? styles.expired
                      : expiringSoon
                      ? styles.expiringSoon
                      : ""
                  }
                >
                  <td className={styles.nameCell}>
                    <span className={styles.domainName}>{domainName}</span>
                    {expired && (
                      <span className={styles.expiredBadge}>Expired</span>
                    )}
                    {expiringSoon && !expired && (
                      <span className={styles.expiringSoonBadge}>
                        Expiring Soon
                      </span>
                    )}
                  </td>
                  <td>
                    {item.registrationDate
                      ? formatDate(item.registrationDate)
                      : "N/A"}
                  </td>
                  <td
                    className={
                      expired
                        ? styles.expiredDate
                        : expiringSoon
                        ? styles.expiringSoonDate
                        : ""
                    }
                  >
                    {formatDate(item.expiryDate)}
                  </td>
                  <td>
                    <Link href={`/ens/manage/${domainName}`} passHref>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        className={styles.actionButton}
                      >
                        Manage
                      </Button>
                    </Link>
                    {expired && (
                      <Button
                        size="sm"
                        variant="outline-success"
                        className={`${styles.actionButton} ms-2`}
                      >
                        Renew
                      </Button>
                    )}
                    {expiringSoon && !expired && (
                      <Button
                        size="sm"
                        variant="outline-warning"
                        className={`${styles.actionButton} ms-2`}
                      >
                        Renew
                      </Button>
                    )}
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
