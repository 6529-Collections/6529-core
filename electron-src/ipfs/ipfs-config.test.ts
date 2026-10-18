import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IPFS_DAEMON_ARGS, withStorageLimits } from "./ipfs-config";

describe("IPFS storage limits", () => {
  it("collects cached blocks in the daemon", () => {
    assert.deepEqual(IPFS_DAEMON_ARGS, ["daemon", "--migrate", "--enable-gc"]);
  });

  it("caps the repository and keeps the rest of the datastore settings", () => {
    const spec = { type: "mount", mounts: [] };
    assert.deepEqual(withStorageLimits({ Spec: spec, StorageMax: "100GB", BloomFilterSize: 0 }), {
      Spec: spec,
      BloomFilterSize: 0,
      StorageMax: "10GB",
      StorageGCWatermark: 90,
      GCPeriod: "1h",
    });
  });

  it("works on a repository without datastore settings", () => {
    assert.equal(withStorageLimits(undefined).StorageMax, "10GB");
  });
});
