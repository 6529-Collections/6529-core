import { DataSource, EntityManager } from "typeorm";
import { repairMemeCatchUpEditionSizeFloor } from "../../../shared/memes-edition-size-floor";
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
  db: DataSource | EntityManager,
  nfts: NFT[],
) {
  if (nfts.length === 0) {
    return nfts;
  }

  const distinctContracts = [
    ...new Set(nfts.map((nft) => nft.contract.toLowerCase())),
  ];
  const existingNfts = await db
    .getRepository(NFT)
    .createQueryBuilder("nft")
    .select(["nft.contract", "nft.id", "nft.edition_size_floor"])
    .where("LOWER(nft.contract) IN (:...contracts)", {
      contracts: distinctContracts,
    })
    .getMany();
  const existingFloors = new Map(
    existingNfts
      .map((nft) => [
        getNftKey(nft),
        getPositiveInteger(nft.edition_size_floor),
      ])
      .filter((entry): entry is [string, number] => entry[1] !== null),
  );

  return nfts.map((nft) => {
    const editionSizeFloor =
      getPositiveInteger(nft.edition_size_floor) ??
      existingFloors.get(getNftKey(nft)) ??
      getPositiveInteger(nft.edition_size) ??
      null;

    return {
      ...nft,
      // Preserve the confirmed historical denominators for #206/#215/#311
      // across stale discovery and TDH saves, even after the DB repair ran.
      edition_size_floor: repairMemeCatchUpEditionSizeFloor(
        nft,
        editionSizeFloor,
      ),
    };
  });
}
