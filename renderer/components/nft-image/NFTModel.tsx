import { useEffect, useRef } from "react";
import type { BaseNFT } from "@/entities/INFT";
import { getResolvedAnimationSrc } from "@/components/nft-image/utils/animation-source";
import { useGatewayImageLoadState } from "@/components/common/image/useGatewayImageLoadState";
import { getNFTMediaRendererAttributes } from "@/components/nft-image/media-renderer-marker";

type ModelViewerElement = HTMLElement & {
  src: string;
};

export default function NFTModel(
  props: Readonly<{ nft: BaseNFT; id?: string | undefined }>
) {
  const modelRef = useRef<ModelViewerElement | null>(null);
  const { activeSrc, isPlaceholder, handleError } = useGatewayImageLoadState(
    getResolvedAnimationSrc(props.nft),
    false
  );

  useEffect(() => {
    async function loadModelViewer() {
      try {
        await import("@google/model-viewer");
      } catch (error: unknown) {
        console.error("Failed to load the 3D model viewer", error);
      }
    }

    void loadModelViewer();
  }, []);

  useEffect(() => {
    const modelElement = modelRef.current;
    if (!modelElement) {
      return;
    }

    modelElement.addEventListener("error", handleError);

    return () => {
      modelElement.removeEventListener("error", handleError);
    };
  }, [handleError]);

  return (
    // @ts-ignore
    <model-viewer
      {...getNFTMediaRendererAttributes("glb")}
      ref={modelRef}
      id={props.id ?? `iframe-${props.nft.id}`}
      src={isPlaceholder ? undefined : activeSrc ?? undefined}
      alt={props.nft.name}
      auto-rotate
      camera-controls
      ar
      // @ts-ignore
      poster={props.nft.scaled}
    ></model-viewer>
  );
}
