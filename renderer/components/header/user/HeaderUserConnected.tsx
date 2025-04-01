import { useQuery } from "@tanstack/react-query";
import { IProfileAndConsolidations } from "../../../entities/IProfile";
import { commonApiFetch } from "../../../services/api/common-api";
import HeaderUserConnecting from "./HeaderUserConnecting";
import HeaderUserContext from "./HeaderUserContext";
import { useSeedWallet } from "../../../contexts/SeedWalletContext";

import { QueryKey } from "../../react-query-wrapper/ReactQueryWrapper";
export default function HeaderUserConnected({
  connectedAddress,
}: {
  readonly connectedAddress: string;
}) {
  const { isSeedWallet, isFetched } = useSeedWallet();
  const { isLoading, data: profile } = useQuery<IProfileAndConsolidations>({
    queryKey: [QueryKey.PROFILE, connectedAddress.toLowerCase()],
    queryFn: async () =>
      await commonApiFetch<IProfileAndConsolidations>({
        endpoint: `profiles/${connectedAddress}`,
      }),
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
