import React from "react";
import { getSafeMediaSourceUrl } from "./safeMediaSourceUrl";

/**
 * Audio display component without interactive modal functionality.
 * Based on DropListItemContentMediaAudio but with optional controls.
 */
function MediaDisplayAudio({
  src,
  showControls = false,
}: {
  readonly src: string;
  readonly showControls?: boolean | undefined;
}) {
  const safeSrc = React.useMemo(() => getSafeMediaSourceUrl(src), [src]);

  return (
    <div className="tw-h-full tw-w-full">
      {showControls && safeSrc ? (
        <audio controls className="tw-max-h-10 tw-w-full">
          <source src={safeSrc} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      ) : (
        <div className="tw-bg-iron-850 tw-flex tw-items-center tw-justify-center tw-rounded-lg tw-p-2">
          <span className="tw-text-xs tw-text-iron-400">Audio</span>
        </div>
      )}
    </div>
  );
}

export default React.memo(MediaDisplayAudio);
