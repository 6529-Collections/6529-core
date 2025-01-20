import { useEffect, useMemo } from "react";
import { ethers } from "ethersv5";
import { useAccount } from "wagmi";
import { RPC_URLS, FALLBACK_RPC_URLS, SupportedChainId } from "../constants";

export function useEthersProvider() {
  const { chain } = useAccount();

  const provider = useMemo(() => {
    if (!chain?.id) return null;

    try {
      const rpcUrl = RPC_URLS[chain.id as SupportedChainId];
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl, {
        chainId: chain.id,
        name: chain.name || "unknown",
      });

      // Test the connection silently
      provider.getNetwork().catch(() => {});

      return provider;
    } catch (error) {
      // ... fallback logic
    }
  }, [chain?.id]);

  return provider;
}
