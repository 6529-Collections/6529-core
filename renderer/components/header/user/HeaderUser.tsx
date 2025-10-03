"use client";

import { useSeizeConnectContext } from "@/components/auth/SeizeConnectContext";
import HeaderUserConnect from "./HeaderUserConnect";
import HeaderUserConnected from "./HeaderUserConnected";

export default function HeaderUser() {
  const { address } = useSeizeConnectContext();

  return (
    <div className="tailwind-scope">
      {address ? (
        <HeaderUserConnected connectedAddress={address} />
      ) : (
        <div className="tw-mx-3">
          <HeaderUserConnect />
        </div>
      )}
    </div>
  );
}
