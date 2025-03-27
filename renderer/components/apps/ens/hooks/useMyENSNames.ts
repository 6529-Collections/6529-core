// renderer/components/apps/ens/hooks/useMyENSNames.ts

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";

const GRAPH_API_KEY = "be825bb3d53a2942ed16cb022db031e8";
const ENS_SUBGRAPH_URL =
  "https://api.thegraph.com/subgraphs/name/ensdomains/ens";

// Simplified interface for ENS names
interface ENSName {
  id: string;
  name: string;
  registrationDate: string;
  expiryDate: string | null;
  owner: string;
  isPrimary: boolean;
}

export function useMyENSNames() {
  const { address, isConnected } = useAccount();

  const {
    data: ensNames = [],
    isLoading,
    error,
    refetch,
  } = useQuery<ENSName[]>({
    queryKey: ["userENSNames", address?.toLowerCase()],
    queryFn: async () => {
      if (!address) {
        console.log("📊 No wallet address available");
        return [];
      }

      console.log(`📊 Fetching ENS names for address: ${address}`);

      // Comprehensive approach: query all three ways ENS names can be associated with an address
      const query = `
        {
          # APPROACH 1: Get domains where this address is the owner
          ownedDomains: domains(
            where: { 
              owner: "${address.toLowerCase()}",
              name_ends_with: ".eth"
            }
          ) {
            id
            name
            labelName
            createdAt
            expiryDate
          }
          
          # APPROACH 2: Get domains where this address is explicitly set as the controller/manager
          controllerDomains: registrations(
            where: { 
              registrant: "${address.toLowerCase()}"
            }
          ) {
            id
            labelName
            registrationDate
            expiryDate
            domain {
              id
              name
            }
          }

          # APPROACH 3: Get names that resolve to this address
          resolvedDomains: domains(
            where: {
              resolvedAddress: "${address.toLowerCase()}",
              name_ends_with: ".eth"
            }
          ) {
            id
            name
            labelName
            createdAt
            expiryDate
          }
        }
      `;

      try {
        const response = await fetch(ENS_SUBGRAPH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GRAPH_API_KEY}`,
          },
          body: JSON.stringify({ query }),
        });

        console.log("📊 Response status:", response.status);

        if (!response.ok) {
          throw new Error(
            `API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        console.log("📊 Raw API response:", data);

        if (data.errors) {
          throw new Error(`GraphQL Error: ${data.errors[0].message}`);
        }

        // Extract data from all three approaches and merge them
        const allDomains = new Map<string, ENSName>();

        // Process owned domains
        if (data.data.ownedDomains) {
          data.data.ownedDomains.forEach((domain: any) => {
            if (!domain.name?.endsWith(".eth")) return;

            allDomains.set(domain.name, {
              id: domain.id,
              name: domain.name,
              registrationDate: domain.createdAt
                ? new Date(Number(domain.createdAt) * 1000).toISOString()
                : new Date().toISOString(),
              expiryDate: domain.expiryDate
                ? new Date(Number(domain.expiryDate) * 1000).toISOString()
                : null,
              owner: address,
              isPrimary: false, // Will update later
            });
          });
        }

        // Process controller domains
        if (data.data.controllerDomains) {
          data.data.controllerDomains.forEach((reg: any) => {
            if (!reg.domain?.name?.endsWith(".eth")) return;

            const name = reg.domain.name;
            allDomains.set(name, {
              id: reg.id,
              name: name,
              registrationDate: reg.registrationDate
                ? new Date(Number(reg.registrationDate) * 1000).toISOString()
                : new Date().toISOString(),
              expiryDate: reg.expiryDate
                ? new Date(Number(reg.expiryDate) * 1000).toISOString()
                : null,
              owner: address,
              isPrimary: false, // Will update later
            });
          });
        }

        // Process resolved domains
        if (data.data.resolvedDomains) {
          data.data.resolvedDomains.forEach((domain: any) => {
            if (!domain.name?.endsWith(".eth")) return;

            // Check if we already have this domain
            if (!allDomains.has(domain.name)) {
              allDomains.set(domain.name, {
                id: domain.id,
                name: domain.name,
                registrationDate: domain.createdAt
                  ? new Date(Number(domain.createdAt) * 1000).toISOString()
                  : new Date().toISOString(),
                expiryDate: domain.expiryDate
                  ? new Date(Number(domain.expiryDate) * 1000).toISOString()
                  : null,
                owner: address,
                isPrimary: false, // Will update later
              });
            }

            // If this is a domain that resolves to the address, it might be the primary
            // Let's mark it as potentially primary
            const existing = allDomains.get(domain.name);
            if (existing) {
              existing.isPrimary = true;
            }
          });
        }

        const result = Array.from(allDomains.values());
        console.log("📊 Combined ENS domains:", result);

        return result;
      } catch (error) {
        console.error("📊 Error fetching user ENS data:", error);
        throw error;
      }
    },
    enabled: isConnected && !!address,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    ensNames,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
