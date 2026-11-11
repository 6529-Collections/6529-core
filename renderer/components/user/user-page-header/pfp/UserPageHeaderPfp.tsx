"use client";

import type { ApiIdentity } from "@/generated/models/ApiIdentity";
import Image from "next/image";
import { useGatewayImageLoadState } from "@/components/common/image/useGatewayImageLoadState";
import { getScaledResolvedImageUri, ImageScale } from "@/helpers/image.helpers";
import { parseDecentralizedMediaRef } from "@/lib/media/decentralized-media";
import { isGifImageUrl } from "@/helpers/gif-preview.helpers";
import { getUserProfileHeaderMessage } from "../user-page-header.messages";

export default function UserPageHeaderPfp({
  profile,
  profileLabel,
  defaultBanner1,
  defaultBanner2,
}: {
  readonly profile: ApiIdentity;
  readonly profileLabel: string;
  readonly defaultBanner1: string;
  readonly defaultBanner2: string;
}) {
  const { activeSrc, isPlaceholder, handleError, unoptimized } =
    useGatewayImageLoadState(
      profile.pfp,
      (candidate) => {
        if (!parseDecentralizedMediaRef(profile.pfp) || isGifImageUrl(candidate)) {
          return false;
        }

        try {
          return new URL(candidate).port === "";
        } catch {
          return false;
        }
      }
    );
  const glassWrapperClass =
    "tw-relative tw-z-10 tw-inline-flex tw-flex-shrink-0 tw-p-0.5 tw-rounded-xl tw-bg-white/10 tw-backdrop-blur-md tw-ring-1 tw-ring-white/20 tw-shadow-2xl";

  if (activeSrc && !isPlaceholder) {
    return (
      <div className={glassWrapperClass}>
        <Image
          key={`${activeSrc}-${unoptimized}`}
          unoptimized={unoptimized}
          src={getScaledResolvedImageUri(activeSrc, ImageScale.W_200_H_200)}
          sizes="(min-width: 640px) 112px, 80px"
          onError={handleError}
          alt={getUserProfileHeaderMessage("user.profileHeader.pfp.alt", {
            name: profileLabel,
          })}
          width="144"
          height="144"
          className="tw-h-20 tw-w-auto tw-max-w-20 tw-rounded-xl tw-bg-iron-800 tw-object-contain sm:tw-h-28 sm:tw-max-w-28"
        />
      </div>
    );
  }

  return (
    <div className={glassWrapperClass}>
      <div
        aria-hidden="true"
        className="tw-h-20 tw-w-20 tw-rounded-xl sm:tw-h-28 sm:tw-w-28"
        style={{
          background: `linear-gradient(45deg, ${defaultBanner1} 0%, ${defaultBanner2} 100%)`,
        }}
      />
    </div>
  );
}
