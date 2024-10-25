import { DataSource } from "typeorm";
import { GRADIENT_CONTRACT } from "../../../../shared/abis/gradient";
import { MEMES_CONTRACT } from "../../../../shared/abis/memes";
import { NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { NFT } from "../../../db/entities/INFT";
import { ConsolidatedTDH } from "../../../db/entities/ITDH";
import { fetchAllConsolidatedTdh, persistNFTs } from "./tdh-worker.db";

export const processNftTdh = async (db: DataSource, nfts: NFT[]) => {
  const allTdh = await fetchAllConsolidatedTdh(db);
  const nftTdh = nfts.map((n) => getTdhForNft(allTdh, n));
  await persistNFTs(db, nftTdh);
};

export const getTdhForNft = (allTdh: ConsolidatedTDH[], nft: NFT) => {
  let contractField: "memes" | "gradients" | "nextgen" | undefined;
  switch (nft.contract) {
    case MEMES_CONTRACT.toLowerCase():
      contractField = "memes";
      break;
    case GRADIENT_CONTRACT.toLowerCase():
      contractField = "gradients";
      break;
    case NEXTGEN_CONTRACT.toLowerCase():
      contractField = "nextgen";
      break;
  }

  if (!contractField) {
    return nft;
  }

  const entries = allTdh.filter((t) =>
    t[contractField].some((n) => n.id === nft.id)
  );
  let totalTdh = 0;
  entries.forEach((e) => {
    const nftTdh = e[contractField].find((n) => n.id === nft.id)?.tdh ?? 0;
    totalTdh += Math.round(nftTdh * e.boost);
  });

  return {
    ...nft,
    tdh: totalTdh,
  };
};
