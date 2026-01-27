import { ISeedWallet } from "@/shared/types";
import Image from "next/image";
import Link from "next/link";

export default function SeedWalletCard(
  props: Readonly<{
    wallet: ISeedWallet;
  }>
) {
  return (
    <Link
      href={`/core/core-wallets/${props.wallet.address}`}
      className="group tw-block tw-no-underline tw-transition-transform tw-duration-300 desktop-hover:hover:tw-scale-[1.01]"
    >
      <div className="tw-rounded-xl tw-bg-iron-950 tw-px-4 tw-py-6 tw-ring-1 tw-ring-inset tw-ring-iron-800 tw-transition-all tw-duration-300 hover:tw-ring-iron-600">
        <div className="tw-flex tw-items-center tw-gap-2 tw-break-all">
          <Image
            className="tw-size-10 tw-rounded-full tw-p-0.5 tw-ring-1 tw-ring-inset tw-ring-iron-800"
            fetchPriority="high"
            loading="eager"
            height={36}
            width={36}
            src={`https://robohash.org/${props.wallet.address}.png`}
            alt={props.wallet.address}
          />
          <span className="tw-text-lg tw-font-bold tw-text-white">
            {props.wallet.name}
          </span>
          {props.wallet.imported ? (
            <span className="tw-text-iron-400"> (imported)</span>
          ) : null}
        </div>
        <div className="tw-mt-4 tw-break-all tw-text-sm tw-font-light tw-text-iron-300">
          {props.wallet.address.toLowerCase()}
        </div>
      </div>
    </Link>
  );
}
