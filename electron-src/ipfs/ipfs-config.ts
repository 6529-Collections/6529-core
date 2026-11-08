/** Daemon arguments: repository migrations, and garbage collection of cached blocks. */
export const IPFS_DAEMON_ARGS = ["daemon", "--migrate", "--enable-gc"];

// The node keeps every block it fetches. With --enable-gc, Kubo removes
// unpinned blocks every GCPeriod and whenever the repository passes
// StorageGCWatermark percent of StorageMax. Pinned files (pinned through the
// node's own Web UI, for example) are never removed. Profile picture uploads
// go through the 6529 API, which pins them, not through this node.
export const IPFS_STORAGE_LIMITS = {
  StorageMax: "10GB",
  StorageGCWatermark: 90,
  GCPeriod: "1h",
} as const;

/** The repository's Datastore settings with the app's storage limits applied. */
export function withStorageLimits(
  datastore: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...(datastore ?? {}), ...IPFS_STORAGE_LIMITS };
}
