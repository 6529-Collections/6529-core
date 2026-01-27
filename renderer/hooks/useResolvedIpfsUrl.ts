import { resolveIpfsUrlAsync } from "@/components/ipfs/IPFSContext";
import { useQuery } from "@tanstack/react-query";

export function useResolvedIpfsUrl(src?: string | null) {
  return useQuery<string | null>({
    queryKey: ["ipfs-url", src],
    queryFn: () => (src ? resolveIpfsUrlAsync(src) : Promise.resolve(null)),
    enabled: !!src,
    staleTime: Infinity,
  });
}
