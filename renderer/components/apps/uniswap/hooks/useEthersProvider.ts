import { useEffect, useMemo } from "react";
import { ethers } from "ethersv5";
import { useAccount } from "wagmi";
import { RPC_URLS, FALLBACK_RPC_URLS, SupportedChainId } from "../constants";

export function useEthersProvider() {
  const { chain } = useAccount();

  const provider = useMemo(() => {
    if (!chain?.id) return null;

    try {
      return new ethers.providers.JsonRpcProvider(
        RPC_URLS[chain.id as SupportedChainId]
      );
    } catch (error) {
      console.warn("Primary RPC failed, using fallback:", error);
      return new ethers.providers.JsonRpcProvider(
        FALLBACK_RPC_URLS[chain.id as SupportedChainId]
      );
    }
  }, [chain?.id]);

  return provider;
}
