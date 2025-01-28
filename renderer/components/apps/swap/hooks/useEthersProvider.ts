import { useEffect, useMemo } from "react";
import { ethers } from "ethersv5";
import { useAccount } from "wagmi";
import { sepolia } from "wagmi/chains";
import { SEPOLIA_RPC } from "../constants";

export function useEthersProvider() {
  const { chain } = useAccount();

  const provider = useMemo(() => {
    if (!chain?.id) return null;

    try {
      let provider: ethers.providers.Provider;

      if (chain.id === sepolia.id) {
        provider = new ethers.providers.JsonRpcProvider(SEPOLIA_RPC, {
          chainId: chain.id,
          name: "sepolia",
        });
      } else {
        provider = new ethers.providers.CloudflareProvider();
      }

      provider.getNetwork().catch(() => {});

      return provider;
    } catch (error) {
      console.error("Failed to create provider:", error);
      return null;
    }
  }, [chain?.id]);

  return provider;
}
