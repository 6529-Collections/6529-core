import { useSeedWallet } from "../../../../contexts/SeedWalletContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";

export default function HeaderUserSeedWallet() {
  const { isUnlocked, setShowPasswordModal } = useSeedWallet();
  return (
    <div className="tailwind-scope">
      <button
        onClick={() => setShowPasswordModal(true)}
        type="button"
        aria-label="Seed Wallet"
        title="Seed Wallet"
        className="tw-relative tw-flex tw-items-center tw-justify-center tw-bg-iron-800 tw-px-2 tw-h-10 tw-ring-1 tw-ring-inset tw-ring-iron-700 tw-border-0 tw-text-iron-50 tw-shadow-sm hover:tw-bg-iron-700 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400 tw-transition tw-duration-300 tw-ease-out">
        <FontAwesomeIcon
          icon={isUnlocked ? faLockOpen : faLock}
          width={18}
          height={18}
        />
      </button>
    </div>
  );
}
