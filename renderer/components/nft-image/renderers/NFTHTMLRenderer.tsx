"use client";

import { useLocalIpfsFrameFallback } from "@/components/common/useLocalIpfsFrameFallback";
import NFTImageBalance from "@/components/nft-image/NFTImageBalance";
import NFTMediaContainer from "@/components/nft-image/NFTMediaContainer";
import styles from "@/components/nft-image/NFTImage.module.css";
import type { BaseRendererProps } from "@/components/nft-image/types/renderer-props";
import { getResolvedAnimationSrc } from "@/components/nft-image/utils/animation-source";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMediaGatewayFallbackUrls,
  shouldUseIframeFallbackTimeout,
} from "@/components/nft-image/utils/gateway-fallback";
import { getNFTMediaRendererAttributes } from "@/components/nft-image/media-renderer-marker";
import {
  isMeebits445ViewerRepair,
  MEEBITS_445_VIEWER_PATH,
} from "@/lib/media/meebits-445";
import { getNftHtmlIframeSandbox } from "@/lib/media/nft-html-sandbox";

const IFRAME_FALLBACK_TIMEOUT_MS = 8000;

function getSrc(nft: BaseRendererProps["nft"]): string | undefined {
  return getResolvedAnimationSrc(nft);
}

export default function NFTHTMLRenderer(props: Readonly<BaseRendererProps>) {
  const originalSrc = getSrc(props.nft);
  const repaired = isMeebits445ViewerRepair(props.nft, originalSrc);
  const src = repaired ? MEEBITS_445_VIEWER_PATH : originalSrc;
  const animationClassName = styles["nftAnimation"] ?? "";
  const urls = useMemo(
    () => (src ? getMediaGatewayFallbackUrls(src) : []),
    [src]
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [didLoadCurrentUrl, setDidLoadCurrentUrl] = useState(false);
  const activeUrl = urls[activeIndex];
  const advanceToNextUrl = useCallback(() => {
    setActiveIndex((current) =>
      current === activeIndex && current + 1 < urls.length
        ? current + 1
        : current
    );
  }, [activeIndex, urls.length]);
  const isLocalFrame = useLocalIpfsFrameFallback(activeUrl, advanceToNextUrl);

  useEffect(() => {
    if (urls.length === 0) {
      setActiveIndex(0);
      setDidLoadCurrentUrl(false);
      return;
    }
    setActiveIndex(0);
    setDidLoadCurrentUrl(false);
  }, [urls]);

  useEffect(() => {
    setDidLoadCurrentUrl(false);
  }, [activeUrl]);

  useEffect(() => {
    if (
      !activeUrl ||
      didLoadCurrentUrl ||
      activeIndex + 1 >= urls.length ||
      (!isLocalFrame && !shouldUseIframeFallbackTimeout(activeUrl))
    ) {
      return;
    }

    const timeoutId = globalThis.setTimeout(
      advanceToNextUrl,
      IFRAME_FALLBACK_TIMEOUT_MS
    );

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [
    activeIndex,
    activeUrl,
    advanceToNextUrl,
    didLoadCurrentUrl,
    isLocalFrame,
    urls.length,
  ]);

  return (
    <NFTMediaContainer
      className={`${animationClassName} ${props.heightStyle} ${props.imageStyle} ${props.bgStyle}`}
    >
      {props.showBalance && (
        <NFTImageBalance
          contract={props.nft.contract}
          tokenId={props.nft.id}
          height={props.height}
        />
      )}
      {activeUrl ? (
        <iframe
          {...getNFTMediaRendererAttributes("html")}
          title={props.id}
          src={activeUrl}
          sandbox={
            repaired
              ? "allow-scripts allow-downloads"
              : getNftHtmlIframeSandbox(props.nft, originalSrc)
          }
          referrerPolicy={repaired ? "no-referrer" : undefined}
          id={props.id ?? `iframe-${props.nft.id}`}
          key={`${props.nft.contract}-${props.nft.id}-${activeUrl}`}
          onLoad={() => {
            setDidLoadCurrentUrl(true);
          }}
          onError={advanceToNextUrl}
        />
      ) : null}
    </NFTMediaContainer>
  );
}
