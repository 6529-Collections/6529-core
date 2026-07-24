import { getSafeMediaSourceUrl } from "./safeMediaSourceUrl";

export default function DropListItemContentMediaAudio({
  src,
}: {
  readonly src: string;
}) {
  const safeSrc = getSafeMediaSourceUrl(src);

  return (
    <div className="tw-w-full">
      {safeSrc ? (
        <audio controls preload="metadata" className="tw-w-full">
          <source src={safeSrc} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      ) : null}
    </div>
  );
}
