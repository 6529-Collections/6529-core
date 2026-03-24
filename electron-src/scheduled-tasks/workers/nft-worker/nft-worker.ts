import { ethers } from "ethers";
import { DataSource } from "typeorm";
import { parentPort } from "worker_threads";
import {
  MEME_8_EDITION_BURN_ADJUSTMENT,
  NULL_ADDRESS,
  NULL_ADDRESS_DEAD,
} from "../../../../electron-constants";
import { GRADIENT_CONTRACT } from "../../../../shared/abis/gradient";
import {
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
} from "../../../../shared/abis/memes";
import { NEXTGEN_CONTRACT } from "../../../../shared/abis/nextgen";
import { areEqualAddresses } from "../../../../shared/helpers";
import { Time } from "../../../../shared/time";
import { NFT } from "../../../db/entities/INFT";
import { Transaction } from "../../../db/entities/ITransaction";
import { logInfo } from "../../worker-helpers";

export enum ContractType {
  ERC721,
  ERC1155,
}

export interface Contract {
  name: string;
  address: string;
  abi: any;
  type: ContractType;
}

// Keep this Electron worker aligned with the renderer Arweave fallback order.
const ARWEAVE_GATEWAYS: readonly string[] = [
  "arweave.net",
  "ardrive.net",
  "gateway.arweave.net",
  "gateway.ar.io",
];

const safeParseUrl = (url: string): URL | null => {
  try {
    return new URL(url);
  } catch {
    return null;
  }
};

const normalizeArweaveHost = (hostname: string): string => {
  const lower = hostname.trim().toLowerCase().replace(/\.+$/, "");
  for (const gatewayHost of ARWEAVE_GATEWAYS) {
    if (lower === gatewayHost || lower.endsWith(`.${gatewayHost}`)) {
      return gatewayHost;
    }
  }
  return lower;
};

const isArweaveGatewayHost = (hostname: string): boolean => {
  return ARWEAVE_GATEWAYS.includes(normalizeArweaveHost(hostname));
};

const normalizeMetadataUri = (uri: string): string => {
  const trimmed = uri.trim();

  if (trimmed.startsWith("ar://")) {
    const tx = trimmed.slice("ar://".length).replace(/^\/+/, "");
    return `https://arweave.net/${tx}`;
  }

  return trimmed;
};

const getMetadataUriCandidates = (uri: string): string[] => {
  const normalizedUri = normalizeMetadataUri(uri);
  const parsedUrl = safeParseUrl(normalizedUri);
  if (!parsedUrl || !isArweaveGatewayHost(parsedUrl.hostname)) {
    return [normalizedUri];
  }

  const originalHost = normalizeArweaveHost(parsedUrl.hostname);
  const fallbackUrls = ARWEAVE_GATEWAYS.filter(
    (gatewayHost) => gatewayHost !== originalHost,
  ).map((gatewayHost) => {
    const next = new URL(normalizedUri);
    next.hostname = gatewayHost;
    next.host = gatewayHost + (next.port ? `:${next.port}` : "");
    return next.toString();
  });

  return [normalizedUri, ...fallbackUrls];
};

const fetchMetadataWithArweaveFallback = async (uri: string): Promise<any> => {
  const candidates = getMetadataUriCandidates(uri);
  let lastStatusText = "Unknown error";

  for (const candidateUri of candidates) {
    try {
      const response = await fetch(candidateUri);
      if (response.ok) {
        return await response.json();
      }

      lastStatusText = response.statusText || `${response.status}`;
      if (candidates.length > 1) {
        logInfo(
          parentPort,
          `Metadata fetch failed for ${candidateUri} (${response.status} ${lastStatusText}), trying fallback...`,
        );
      }
    } catch (error) {
      lastStatusText = error instanceof Error ? error.message : `${error}`;
      if (candidates.length > 1) {
        logInfo(
          parentPort,
          `Metadata fetch failed for ${candidateUri} (${lastStatusText}), trying fallback...`,
        );
      }
    }
  }

  throw new Error(`Failed to fetch NFT metadata: ${lastStatusText}`);
};

export const retrieveNftFromURI = async (
  db: DataSource,
  contract: string,
  tokenId: number,
  uri: string,
  editionSizes: { editionSize: number; burnt: number },
): Promise<NFT> => {
  logInfo(
    parentPort,
    `Retrieving NFT [${contract} - ${tokenId}] from URI: ${uri}`,
  );

  const json = await fetchMetadataWithArweaveFallback(uri);

  const mintDate = await getMintDate(db, contract, tokenId);

  const season =
    json.attributes.find((m: any) => m.trait_type === "Type - Season")?.value ??
    -1;

  let externalUrl = json.external_url;
  if (!externalUrl) {
    externalUrl = getExternalUrl(contract, tokenId);
  }

  return {
    id: tokenId,
    contract: contract.toLowerCase(),
    uri,
    full_metadata: json,
    mint_date: mintDate,
    edition_size: editionSizes.editionSize,
    burns: editionSizes.burnt,
    name: json.name,
    description: json.description,
    external_url: externalUrl,
    image_url: json.image,
    image_details: json.image_details,
    animation_url: json.animation_url,
    animation_details: json.animation_details,
    attributes: json.attributes,
    tdh: 0,
    generator: json.generator,
    season,
  };
};

export const getTokenUri = async (
  contractType: ContractType,
  ethersContract: ethers.Contract,
  tokenId: number,
) => {
  let uri;
  try {
    if (contractType === ContractType.ERC721) {
      uri = await ethersContract.tokenURI(tokenId);
    } else {
      uri = await ethersContract.uri(tokenId);
    }
  } catch (e) {
    uri = null;
  }

  return uri;
};

export const getExternalUrl = (contract: string, tokenId: number) => {
  let path;
  if (areEqualAddresses(contract, MEMES_CONTRACT)) {
    path = `the-memes/${tokenId}`;
  } else if (areEqualAddresses(contract, MEMELAB_CONTRACT)) {
    path = `meme-lab/${tokenId}`;
  } else if (areEqualAddresses(contract, GRADIENT_CONTRACT)) {
    path = `6529-gradient/${tokenId}`;
  } else if (areEqualAddresses(contract, NEXTGEN_CONTRACT)) {
    path = `nextgen/token/${tokenId}`;
  }

  return `https://6529.io/${path}`;
};

export const getEditionSizes = async (
  db: DataSource,
  contractAddress: string,
  ethersContract: ethers.Contract,
  tokenId: number,
) => {
  let burnt = await getBurns(db, contractAddress, tokenId);
  let editionSize;
  if (areEqualAddresses(contractAddress, GRADIENT_CONTRACT)) {
    editionSize = 101;
  } else if (areEqualAddresses(contractAddress, NEXTGEN_CONTRACT)) {
    const collectionId = Math.round(tokenId / 10000000000);
    const viewTokensIndexMin =
      await ethersContract.viewTokensIndexMin(collectionId);
    const viewTokensIndexMax =
      await ethersContract.viewTokensIndexMax(collectionId);
    editionSize = Number(viewTokensIndexMax) - Number(viewTokensIndexMin) + 1;
  } else {
    editionSize = Number(await getMints(db, contractAddress, tokenId));
    if (areEqualAddresses(contractAddress, MEMES_CONTRACT) && tokenId === 8) {
      editionSize += MEME_8_EDITION_BURN_ADJUSTMENT;
      burnt += MEME_8_EDITION_BURN_ADJUSTMENT;
    }
  }

  return {
    editionSize,
    burnt,
  };
};

export const getMints = async (
  db: DataSource,
  contract: string,
  tokenId: number,
) => {
  const repo = db.getRepository(Transaction);
  const result = await repo
    .createQueryBuilder("transaction")
    .select("SUM(transaction.token_count)", "sum")
    .where("transaction.contract = :contract", {
      contract: contract.toLowerCase(),
    })
    .andWhere("transaction.token_id = :tokenId", { tokenId })
    .andWhere("transaction.from_address = :nullAddress", {
      nullAddress: NULL_ADDRESS,
    })
    .getRawOne();

  return result.sum;
};

export const getBurns = async (
  db: DataSource,
  contract: string,
  tokenId: number,
) => {
  const repo = db.getRepository(Transaction);
  const result = await repo
    .createQueryBuilder("transaction")
    .select("SUM(transaction.token_count)", "sum")
    .where("transaction.contract = :contract", {
      contract: contract.toLowerCase(),
    })
    .andWhere("transaction.token_id = :tokenId", { tokenId })
    .andWhere("transaction.to_address IN (:...addresses)", {
      addresses: [NULL_ADDRESS, NULL_ADDRESS_DEAD],
    })
    .getRawOne();

  return result.sum ?? 0;
};

export const getMintDate = async (
  db: DataSource,
  contract: string,
  tokenId: number,
) => {
  const firstTransaction = await db.getRepository(Transaction).findOne({
    where: { contract: contract.toLowerCase(), token_id: tokenId },
    order: { block: "ASC" },
  });

  return firstTransaction?.transaction_date ?? Time.now().toSeconds();
};
