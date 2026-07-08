import { DataSource, In } from "typeorm";
import { NFT } from "../../db/entities/INFT";

function getPositiveInteger(value: number | null | undefined): number | null {
  return value !== null &&
    value !== undefined &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

function getNftKey(nft: Pick<NFT, "contract" | "id">) {
  return `${nft.contract.toLowerCase()}-${nft.id}`;
}

export async function preserveEditionSizeFloors(
  db: DataSource,
  nfts: NFT[],
) {
  if (nfts.length === 0) {
    return nfts;
  }

  const distinctContracts = [...new Set(nfts.map((nft) => nft.contract))];
  const existingNfts = await db.getRepository(NFT).find({
    select: {
      contract: true,
      id: true,
      edition_size_floor: true,
    },
    where: {
      contract: In(distinctContracts),
    },
  });
  const existingFloors = new Map(
    existingNfts
      .map((nft) => [
        getNftKey(nft),
        getPositiveInteger(nft.edition_size_floor),
      ])
      .filter((entry): entry is [string, number] => entry[1] !== null),
  );

  return nfts.map((nft) => {
    if (getPositiveInteger(nft.edition_size_floor) !== null) {
      return nft;
    }

    return {
      ...nft,
      edition_size_floor:
        existingFloors.get(getNftKey(nft)) ??
        getPositiveInteger(nft.edition_size) ??
        0,
    };
  });
}
