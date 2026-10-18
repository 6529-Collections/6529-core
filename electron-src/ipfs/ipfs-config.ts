/** Daemon arguments: repository migrations, and garbage collection of cached blocks. */
export const IPFS_DAEMON_ARGS = ["daemon", "--migrate", "--enable-gc"];

// The node keeps every block it fetches. With --enable-gc, Kubo removes
// unpinned blocks every GCPeriod and whenever the repository passes
// StorageGCWatermark percent of StorageMax. Files the app adds are pinned
// (renderer IPFSService adds with pin=true) and are never removed.
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
