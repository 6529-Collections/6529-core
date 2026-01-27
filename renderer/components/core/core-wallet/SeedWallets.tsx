"use client";

import { getSeedWallets } from "@/electron";
import { ISeedWallet } from "@/shared/types";
import { faPlusCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { mainnet } from "viem/chains";
import SeedWalletCard from "./SeedWalletCard";
import { CreateSeedWalletModal } from "./SeedWalletModal";

export const SEED_WALLETS_NETWORK = mainnet;

const btnBase =
  "tw-inline-flex tw-cursor-pointer tw-items-center tw-gap-2 tw-rounded-lg tw-border-0 tw-px-5 tw-py-3 tw-text-sm tw-font-medium tw-transition-colors focus-visible:tw-outline-none focus-visible:tw-ring-2 focus-visible:tw-ring-primary-400 focus-visible:tw-ring-offset-2 focus-visible:tw-ring-offset-iron-950";

export default function SeedWallets() {
  const router = useRouter();
  const [seedWallets, setSeedWallets] = useState<ISeedWallet[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchWallets = () => {
    getSeedWallets().then((data) => {
      setSeedWallets(data.data);
    });
  };

  useEffect(() => {
    fetchWallets();
  }, []);

  return (
    <div className="tw-py-8">
      <h1 className="tw-m-0">
        <span className="tw-text-iron-400">6529 Desktop</span> Wallets
      </h1>
      <div className="tw-pt-6">
        <div className="tw-grid tw-grid-cols-1 tw-gap-4 sm:tw-grid-cols-2 md:tw-grid-cols-3">
          {seedWallets.map((s) => (
            <SeedWalletCard key={s.address} wallet={s} />
          ))}
        </div>
      </div>
      <div className={seedWallets.length > 0 ? "tw-pt-6" : ""}>
        <div className="tw-flex tw-items-center tw-gap-3">
          <CreateSeedWalletModal
            show={showCreateModal}
            onHide={(refresh: boolean) => {
              setShowCreateModal(false);
              if (refresh) fetchWallets();
            }}
          />
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className={`${btnBase} tw-bg-primary-500 tw-text-white desktop-hover:hover:tw-bg-primary-600`}
          >
            <FontAwesomeIcon icon={faPlusCircle} className="tw-h-5 tw-w-5 tw-shrink-0" /> Create Wallet
          </button>
          <button
            type="button"
            onClick={() => router.push("/core/core-wallets/import-wallet")}
            className={`${btnBase} tw-bg-emerald-600 tw-text-white desktop-hover:hover:tw-bg-emerald-500`}
          >
            <FontAwesomeIcon icon={faPlusCircle} className="tw-h-5 tw-w-5 tw-shrink-0" /> Import Wallet
          </button>
        </div>
      </div>
    </div>
  );
}
