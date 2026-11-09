import WaveDropAuthorPfp from "@/components/waves/drops/WaveDropAuthorPfp";
import type { ApiDrop } from "@/generated/models/ApiDrop";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ImageProps } from "next/image";

const mockLocalAvatar = "http://127.0.0.1:8080/ipfs/avatar";
const mockRemoteAvatar = "https://media.6529.io/ipfs/avatar";

jest.mock("@/components/ipfs/IPFSContext", () => ({
  resolveIpfsUrlSync: () => mockLocalAvatar,
}));
jest.mock("@/components/nft-image/utils/gateway-fallback", () => ({
  getMediaGatewayFallbackUrls: () => [mockLocalAvatar, mockRemoteAvatar],
}));
jest.mock("@/components/utils/tooltip/UserProfileTooltipWrapper", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("next/image", () => ({
  __esModule: true,
  default: ({
    src,
    alt,
    onError,
    unoptimized,
  }: Omit<ImageProps, "src"> & { src: string }) => (
    <img
      src={src}
      alt={alt}
      onError={onError}
      data-unoptimized={String(Boolean(unoptimized))}
    />
  ),
}));

it("retries the Wave avatar remotely before showing a placeholder", () => {
  const drop = { author: { handle: "artist", pfp: "ipfs://avatar" } } as ApiDrop;
  render(<WaveDropAuthorPfp drop={drop} disableNavigation />);

  const avatar = () =>
    screen.getByRole("img", { name: "artist's profile picture" });

  expect(avatar()).toHaveAttribute("src", mockLocalAvatar);
  fireEvent.error(avatar());
  expect(avatar()).toHaveAttribute("data-unoptimized", "true");
  fireEvent.error(avatar());

  expect(avatar()).toHaveAttribute("src", mockRemoteAvatar);
  expect(avatar()).toHaveAttribute("data-unoptimized", "false");
  fireEvent.error(avatar());
  expect(avatar()).toHaveAttribute("src", mockRemoteAvatar);
  expect(avatar()).toHaveAttribute("data-unoptimized", "true");
  fireEvent.error(avatar());

  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
