import GroupCreateNftsSelect from "./GroupCreateNftsSelect";
import {
  ApiGroupOwnsNft,
  ApiGroupOwnsNftNameEnum,
} from "../../../../../../generated/models/ApiGroupOwnsNft";
import { NFTSearchResult } from "../../../../../header/header-search/HeaderSearchModalItem";
import {
  GRADIENT_CONTRACT,
  MEMELAB_CONTRACT,
  MEMES_CONTRACT,
  NEXTGEN_CONTRACT,
} from "../../../../../../constants";
import { ApiCreateGroupDescription } from "../../../../../../generated/models/ApiCreateGroupDescription";
import GroupCreateNftsSelected from "./GroupCreateNftsSelected";

export default function GroupCreateNfts({
  nfts,
  setNfts,
}: {
  readonly nfts: ApiCreateGroupDescription["owns_nfts"];
  readonly setNfts: (nfts: ApiCreateGroupDescription["owns_nfts"]) => void;
}) {
  const NAME_ENUMS: Record<string, ApiGroupOwnsNftNameEnum> = {
    [GRADIENT_CONTRACT.toLowerCase()]: ApiGroupOwnsNftNameEnum.Gradients,
    [MEMES_CONTRACT.toLowerCase()]: ApiGroupOwnsNftNameEnum.Memes,
    [MEMELAB_CONTRACT.toLowerCase()]: ApiGroupOwnsNftNameEnum.Memelab,
    [NEXTGEN_CONTRACT.toLowerCase()]: ApiGroupOwnsNftNameEnum.Nextgen,
  };

  const onSelect = (item: NFTSearchResult) => {
    const nameEnum = NAME_ENUMS[item.contract.toLowerCase()];
    if (!nameEnum) {
      return;
    }
    const group: ApiGroupOwnsNft = nfts.find((g) => g.name === nameEnum) ?? {
      name: nameEnum,
      tokens: [],
    };

    const isPresent = group.tokens.find((t) => t === `${item.id}`);
    if (isPresent) {
      group.tokens = group.tokens.filter((t) => t !== `${item.id}`);
    } else {
      group.tokens.push(`${item.id}`);
    }

    const newSelected = nfts.filter((g) => g.name !== nameEnum);
    newSelected.push(group);
    setNfts(newSelected);
  };

  const onRemove = ({
    name,
    token,
  }: {
    name: ApiGroupOwnsNftNameEnum;
    token: string;
  }) => {
    const updatedNfts = nfts
      .map((group) => {
        if (group.name === name) {
          return {
            ...group,
            tokens: group.tokens.filter((t) => t !== token),
          };
        }
        return group;
      })
      .filter((group) => group.tokens.length > 0);

    setNfts(updatedNfts);
  };

  return (
    <div className="tw-col-span-full">
      <div className="tw-inline-flex tw-items-center tw-space-x-3 sm:tw-space-x-4">
        <span className="tw-inline-flex tw-items-center tw-justify-center tw-rounded-xl tw-size-10 sm:tw-size-11 tw-bg-iron-950 tw-border tw-border-solid tw-border-iron-700">
          <svg
            className="tw-flex-shrink-0 tw-text-iron-50 tw-size-5 sm:tw-size-6"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22 8.5H2M2 12.5H5.54668C6.08687 12.5 6.35696 12.5 6.61813 12.5466C6.84995 12.5879 7.0761 12.6563 7.29191 12.7506C7.53504 12.8567 7.75977 13.0065 8.20924 13.3062L8.79076 13.6938C9.24023 13.9935 9.46496 14.1433 9.70809 14.2494C9.9239 14.3437 10.15 14.4121 10.3819 14.4534C10.643 14.5 10.9131 14.5 11.4533 14.5H12.5467C13.0869 14.5 13.357 14.5 13.6181 14.4534C13.85 14.4121 14.0761 14.3437 14.2919 14.2494C14.535 14.1433 14.7598 13.9935 15.2092 13.6938L15.7908 13.3062C16.2402 13.0065 16.465 12.8567 16.7081 12.7506C16.9239 12.6563 17.15 12.5879 17.3819 12.5466C17.643 12.5 17.9131 12.5 18.4533 12.5H22M2 7.2L2 16.8C2 17.9201 2 18.4802 2.21799 18.908C2.40973 19.2843 2.71569 19.5903 3.09202 19.782C3.51984 20 4.07989 20 5.2 20L18.8 20C19.9201 20 20.4802 20 20.908 19.782C21.2843 19.5903 21.5903 19.2843 21.782 18.908C22 18.4802 22 17.9201 22 16.8V7.2C22 6.0799 22 5.51984 21.782 5.09202C21.5903 4.7157 21.2843 4.40974 20.908 4.21799C20.4802 4 19.9201 4 18.8 4L5.2 4C4.0799 4 3.51984 4 3.09202 4.21799C2.7157 4.40973 2.40973 4.71569 2.21799 5.09202C2 5.51984 2 6.07989 2 7.2Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="tw-mb-0 tw-text-xl sm:tw-text-2xl tw-font-semibold tw-text-iron-50">
          Owns NFTs
        </p>
      </div>
      <div className="tw-mt-4 tw-grid tw-grid-cols-1 lg:tw-grid-cols-2 tw-gap-4 sm:tw-gap-6">
        <div className="tw-p-3 sm:tw-p-5 tw-bg-iron-950 tw-rounded-xl tw-shadow tw-border tw-border-solid tw-border-iron-800">
          <p className="tw-mb-0 tw-text-base sm:tw-text-lg tw-font-semibold tw-text-iron-50">
            Search NFT&apos;s
          </p>
          <div className="tw-mt-2 sm:tw-mt-3">
            <GroupCreateNftsSelect onSelect={onSelect} selected={nfts} />
          </div>
          <GroupCreateNftsSelected selected={nfts} onRemove={onRemove} />
        </div>
      </div>
    </div>
  );
}
