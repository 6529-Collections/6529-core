jest.mock("@/lib/media/ipfs-gateways", () => ({
  getConfiguredIpfsGatewayHost: () => "127.0.0.1",
}));

jest.mock("@/lib/media/arweave-gateways", () => ({
  canonicalizeArweaveGatewayHostname: (hostname: string) =>
    hostname.toLowerCase(),
  isArweaveGatewayRuntimeHost: () => false,
}));

import { canonicalizeInteractiveMediaUrl } from "@/components/waves/memes/submission/constants/security";

describe("interactive media security", () => {
  it("allows nested public ipfs paths", () => {
    expect(
      canonicalizeInteractiveMediaUrl(
        "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/index.html"
      )
    ).toBe(
      "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/index.html"
    );
  });

  it("allows loopback http ipfs gateways with dynamic ports", () => {
    expect(
      canonicalizeInteractiveMediaUrl(
        "http://127.0.0.1:9255/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/index.html"
      )
    ).toBe(
      "http://127.0.0.1:9255/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/index.html"
    );
  });

  it("rejects non-loopback http gateways", () => {
    expect(
      canonicalizeInteractiveMediaUrl(
        "http://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/index.html"
      )
    ).toBeNull();
  });
});
