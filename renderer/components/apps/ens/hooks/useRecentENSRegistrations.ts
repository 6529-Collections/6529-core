import { useQuery } from "@tanstack/react-query";

const GRAPH_API_KEY = "be825bb3d53a2942ed16cb022db031e8";
const ENS_SUBGRAPH_URL =
  "https://api.thegraph.com/subgraphs/name/ensdomains/ens";

interface RecentRegistration {
  name: string;
  registrationDate: string;
  owner: string;
}

export function useRecentENSRegistrations() {
  return useQuery({
    queryKey: ["recentENSRegistrations"],
    queryFn: async () => {
      console.log("[ENS Test] Fetching recent registrations");

      const query = `
        {
          registrations(
            first: 5,
            orderBy: registrationDate,
            orderDirection: desc,
            where: { labelName_not: null }
          ) {
            labelName
            registrationDate
            registrant {
              id
            }
          }
        }
      `;

      try {
        console.log("[ENS Test] Sending query:", query);

        const response = await fetch(ENS_SUBGRAPH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GRAPH_API_KEY}`,
          },
          body: JSON.stringify({ query }),
        });

        console.log("[ENS Test] Response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("[ENS Test] API Error:", errorText);
          throw new Error(
            `API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();
        console.log("[ENS Test] Raw API response:", data);

        if (!data.data?.registrations) {
          throw new Error("No registration data received");
        }

        const registrations: RecentRegistration[] = data.data.registrations.map(
          (reg: any) => ({
            name: `${reg.labelName}.eth`,
            registrationDate: new Date(
              Number(reg.registrationDate) * 1000
            ).toISOString(),
            owner: reg.registrant.id,
          })
        );

        console.log("[ENS Test] Transformed registrations:", registrations);
        return registrations;
      } catch (error) {
        console.error("[ENS Test] Error fetching recent registrations:", error);
        throw error;
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });
}
