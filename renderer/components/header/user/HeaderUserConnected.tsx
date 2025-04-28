import HeaderUserConnecting from "./HeaderUserConnecting";
import HeaderUserContext from "./HeaderUserContext";
import { useSeedWallet } from "../../../contexts/SeedWalletContext";
import { useIdentity } from "../../../hooks/useIdentity";
export default function HeaderUserConnected({
  connectedAddress,
}: {
  readonly connectedAddress: string;
}) {
  const { isSeedWallet, isFetched } = useSeedWallet();
  const { isLoading, profile } = useIdentity({
    handleOrWallet: connectedAddress,
    initialProfile: null,
  });
  
  return (
    <div>
      {isLoading || !profile || !isFetched ? (
        <HeaderUserConnecting />
      ) : (
        <HeaderUserContext profile={profile} isSeedWallet={isSeedWallet} />
      )}
    </div>
  );
}
