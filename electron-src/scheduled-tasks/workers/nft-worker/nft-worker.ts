import { parentPort } from "worker_threads";
import { logInfo } from "../../worker-helpers";
import { NFT } from "../../../db/entities/INFT";

export const retrieveNftFromURI = async (
  contract: string,
  tokenId: number,
  uri: string,
  editionSize: number
): Promise<NFT> => {
  logInfo(
    parentPort,
    `Retrieving NFT [${contract} - ${tokenId}] from URI: ${uri}`
  );

  const response = await fetch(uri);
  const json = await response.json();

  return {
    id: tokenId,
    contract: contract.toLowerCase(),
    uri,
    mint_date: new Date(),
    edition_size: editionSize,
    name: json.name,
    description: json.description,
    external_url: json.external_url,
    image_url: json.image,
    image_details: json.image_details,
    animation_url: json.animation_url,
    animation_details: json.animation_details,
    attributes: json.attributes,
    tdh: 0,
  };
};
