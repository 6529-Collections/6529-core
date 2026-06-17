import {
  getMediaGatewayFallbackUrls,
  shouldUseIframeFallbackTimeout,
} from "@/components/nft-image/utils/gateway-fallback";

const CID = "bafybeigdyrzt5sfp7udm7hu76mjts3sfb44oixwkw55rmpbc6g6wuigv3i";
const TX_ID = "OI6-rpJ2C3Ab4HiZRWt5A1SumhjnYigmSPBPX0ICBj8";

describe("gateway fallback helpers", () => {
  it("prefers the 6529 resolver for ipfs protocol urls", () => {
    expect(getMediaGatewayFallbackUrls(`ipfs://${CID}`).slice(0, 3)).toEqual([
      `https://media.6529.io/ipfs/${CID}`,
      `https://ipfs.io/ipfs/${CID}`,
      `https://cf-ipfs.com/ipfs/${CID}`,
    ]);
  });

  it("normalizes ipfs gateway urls back to the 6529 resolver first", () => {
    expect(
      getMediaGatewayFallbackUrls(`https://ipfs.io/ipfs/${CID}`).slice(0, 3)
    ).toEqual([
      `https://media.6529.io/ipfs/${CID}`,
      `https://ipfs.io/ipfs/${CID}`,
      `https://cf-ipfs.com/ipfs/${CID}`,
    ]);
  });

  it("uses timeout fallback for approved arweave gateways and the 6529 resolver", () => {
    expect(shouldUseIframeFallbackTimeout(`https://arweave.net/${TX_ID}`)).toBe(
      true
    );
    expect(
      shouldUseIframeFallbackTimeout(`https://media.6529.io/arweave/${TX_ID}`)
    ).toBe(true);
  });

  it("does not use timeout fallback for empty urls", () => {
    expect(shouldUseIframeFallbackTimeout("")).toBe(false);
  });

  it("does not use timeout fallback for ipfs protocol urls", () => {
    expect(shouldUseIframeFallbackTimeout(`ipfs://${CID}`)).toBe(false);
  });

  it("does not use timeout fallback for ipfs gateways", () => {
    expect(
      shouldUseIframeFallbackTimeout(`https://ipfs.6529.io/ipfs/${CID}`)
    ).toBe(false);
    expect(shouldUseIframeFallbackTimeout(`https://ipfs.io/ipfs/${CID}`)).toBe(
      false
    );
  });
});
