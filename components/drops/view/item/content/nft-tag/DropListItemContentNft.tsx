import { useQuery } from "@tanstack/react-query";
import { ReferencedNft } from "../../../../../../entities/IDrop";
import {
  ReservoirTokensResponse,
  ReservoirTokensResponseTokenElement,
} from "../../../../../../entities/IReservoir";
import { QueryKey } from "../../../../../react-query-wrapper/ReactQueryWrapper";
import { useEffect, useRef, useState } from "react";
import DropListItemContentNftDetails from "./DropListItemContentNftDetails";
import { areEqualAddresses } from "../../../../../../helpers/Helpers";
import {
  GRADIENT_CONTRACT,
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
  NEXTGEN_CONTRACT,
} from "../../../../../../constants";
import Link from "next/link";
import { isMemesEcosystemContract } from "../../../../../../helpers/nft.helpers";

export default function DropListItemContentNft({
  nft: { contract, token, name },
  onImageLoaded,
}: {
  readonly nft: ReferencedNft;
  readonly onImageLoaded: () => void;
}) {
  const { data: nfts } = useQuery<ReservoirTokensResponseTokenElement[]>({
    queryKey: [QueryKey.RESERVOIR_NFT, { contract, token }],
    queryFn: async () => {
      const url = `https://api.reservoir.tools/tokens/v7?tokens=${contract}%3A${token}`;
      const response = await fetch(url);
      if (response.ok) {
        const data: ReservoirTokensResponse = await response.json();
        return data.tokens;
      }
      return [];
    },
    enabled: !!contract && !!token,
    staleTime: 1000 * 60 * 5,
  });

  const [nft, setNft] = useState<ReservoirTokensResponseTokenElement | null>(
    null
  );
  useEffect(() => {
    if (nfts?.length) {
      setNft(nfts[0]);
    }
  }, [nfts]);

  const elementRef = useRef<HTMLDivElement>(null);

  const handleImageLoad = () => {
    onImageLoaded();
  };

  const getNftHref = () => {
    if (areEqualAddresses(contract, MEMES_CONTRACT)) {
      return `/the-memes/${token}`;
    }
    if (areEqualAddresses(contract, GRADIENT_CONTRACT)) {
      return `/6529-gradient/${token}`;
    }
    if (areEqualAddresses(contract, NEXTGEN_CONTRACT)) {
      return `/nextgen/token/${token}`;
    }
    if (areEqualAddresses(contract, MEMELAB_CONTRACT)) {
      return `/memelab/${token}`;
    }
    return `https://opensea.io/assets/ethereum/${contract}/${token}`;
  };

  const getTarget = () => {
    const isMemes = isMemesEcosystemContract(contract);
    if (isMemes) {
      return "";
    }
    return "_blank";
  };

  const nftHref = getNftHref();
  const target = getTarget();

  return (
    <Link
      onClick={(e) => e.stopPropagation()}
      href={nftHref}
      className="tw-no-underline"
      target={target}
    >
      <div className="tw-mt-2 tw-gap-y-2 tw-flex tw-flex-col" ref={elementRef}>
        <div className="tw-w-full tw-h-full">
          {nft && (
            <img
              src={nft.token.imageSmall}
              alt="NFT token"
              className="tw-w-full tw-h-full tw-object-center tw-object-contain lg:tw-max-h-[516px]"
              onLoad={handleImageLoad}
            />
          )}
        </div>
        <DropListItemContentNftDetails
          referencedNft={{ contract, token, name }}
          nft={nft}
        />
      </div>
    </Link>
  );
}
