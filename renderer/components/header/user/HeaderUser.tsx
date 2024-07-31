import { useAccount } from "wagmi";
import HeaderUserConnected from "./HeaderUserConnected";
import HeaderUserConnect from "./HeaderUserConnect";

export default function HeaderUser() {
  const account = useAccount();

  return (
    <div className="tailwind-scope">
      {account.address ? (
        <HeaderUserConnected connectedAddress={account.address} />
      ) : (
        <div className="tw-mx-3">
          <HeaderUserConnect />
        </div>
      )}
    </div>
  );
}
