import { getSafeMediaSourceUrl } from "./safeMediaSourceUrl";

export default function DropListItemContentMediaAudio({
  src,
}: {
  readonly src: string;
}) {
  const safeSrc = getSafeMediaSourceUrl(src);

  return (
    <div>
      {safeSrc ? (
        <audio controls className="tw-max-h-10 tw-w-full">
          <source src={safeSrc} type="audio/mpeg" />
          Your browser does not support the audio element.
        </audio>
      ) : null}
    </div>
  );
}
