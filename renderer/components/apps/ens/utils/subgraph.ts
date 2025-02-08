import { createPublicClient, http } from "viem";

const ENS_SUBGRAPH_URL =
  "https://api.thegraph.com/subgraphs/name/ensdomains/ens";

export async function getNamesByOwner(address: string) {
  const query = `
    query getNames($address: String!) {
      domains(where: { owner: $address }) {
        id
        name
        labelName
        labelhash
        expiryDate
      }
    }
  `;

  // Implementation
}
