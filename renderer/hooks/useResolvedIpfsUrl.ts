import { resolveIpfsUrlSync } from "@/components/ipfs/IPFSContext";
import { useQuery } from "@tanstack/react-query";

export function useResolvedIpfsUrl(src?: string | null) {
  return useQuery<string | null>({
    queryKey: ["ipfs-url", src],
    queryFn: () =>
      Promise.resolve(src ? resolveIpfsUrlSync(src, { preferLocal: false }) : null),
    enabled: !!src,
    staleTime: Infinity,
  });
}
