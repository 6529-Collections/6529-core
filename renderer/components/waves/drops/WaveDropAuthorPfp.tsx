"use client";

import { useGatewayImageLoadState } from "@/components/common/image/useGatewayImageLoadState";
import UserProfileTooltipWrapper from "@/components/utils/tooltip/UserProfileTooltipWrapper";
import { useCompactMode } from "@/contexts/CompactModeContext";
import type { ApiDrop } from "@/generated/models/ApiDrop";
import { getScaledResolvedImageUri, ImageScale } from "@/helpers/image.helpers";
import Image from "next/image";
import Link from "next/link";
import type React from "react";
import { isAnonymousAuthor } from "@/helpers/anonymous-author.helpers";
import { AnonymousAuthorAvatar } from "./AnonymousDropAuthor";

interface WaveDropAuthorPfpProps {
  readonly drop: ApiDrop;
  readonly disableNavigation?: boolean;
}

const WaveDropAuthorPfp: React.FC<WaveDropAuthorPfpProps> = ({
  drop,
  disableNavigation = false,
}) => {
  const compact = useCompactMode();
  const anonymous = isAnonymousAuthor(drop.author);
  const { activeSrc, handleError, isPlaceholder, unoptimized } =
    useGatewayImageLoadState(anonymous ? null : drop.author.pfp);

  const authorHandle = drop.author.handle;
  const profileHref = authorHandle ? `/${authorHandle}` : null;
  const tooltipUser = authorHandle ?? drop.author.id;

  const sizeClasses = compact ? "tw-h-8 tw-w-8" : "tw-h-10 tw-w-10";
  if (anonymous) return <AnonymousAuthorAvatar className={sizeClasses} />;
  const containerClasses = `tw-relative tw-flex-shrink-0 ${sizeClasses} tw-overflow-hidden tw-rounded-lg tw-bg-iron-900 tw-transition-colors tw-duration-300 desktop-hover:group-hover:tw-bg-iron-950`;

  const avatarContent =
    !activeSrc || isPlaceholder ? (
      <div className="tw-h-full tw-w-full tw-rounded-lg tw-bg-iron-900 tw-ring-1 tw-ring-inset tw-ring-white/10 tw-transition-colors tw-duration-300 desktop-hover:group-hover:tw-bg-iron-950" />
    ) : (
      <Image
        key={`${activeSrc}-${unoptimized}`}
        src={getScaledResolvedImageUri(activeSrc, ImageScale.W_AUTO_H_50)}
        alt={
          authorHandle ? `${authorHandle}'s profile picture` : "Profile picture"
        }
        fill
        sizes={compact ? "32px" : "40px"}
        unoptimized={unoptimized}
        onError={handleError}
        className="tw-rounded-lg tw-bg-transparent tw-object-contain"
      />
    );

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
  };

  if (!profileHref || disableNavigation) {
    return <div className={containerClasses}>{avatarContent}</div>;
  }

  return (
    <UserProfileTooltipWrapper user={tooltipUser}>
      <Link
        href={profileHref}
        prefetch={false}
        aria-label={`View ${tooltipUser}'s profile`}
        onClick={handleClick}
        className={`${containerClasses} tw-block`}
      >
        {avatarContent}
      </Link>
    </UserProfileTooltipWrapper>
  );
};

export default WaveDropAuthorPfp;
