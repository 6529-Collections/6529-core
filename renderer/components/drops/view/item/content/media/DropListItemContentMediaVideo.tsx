import React, { useRef, useCallback, useEffect } from "react";
import useCapacitor from "../../../../../../hooks/useCapacitor";
import { useInView } from "../../../../../../hooks/useInView";

function DropListItemContentMediaVideo({ src }: { readonly src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [wrapperRef, inView] = useInView<HTMLDivElement>();
  const capacitor = useCapacitor();

  const handleVideoClick = useCallback(
    (event: React.MouseEvent<HTMLVideoElement>) => {
      if (videoRef.current) {
        event.stopPropagation();
        event.preventDefault();
        if (videoRef.current.muted) {
          videoRef.current.muted = false;
          videoRef.current.play();
        } else if (!videoRef.current.paused) {
          videoRef.current.pause();
        } else {
          videoRef.current.play();
        }
      }
    },
    []
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            video.pause();
            video.muted = true;
          }
        });
      },
      { threshold: 0.5 }
    );

    observer.observe(video);

    return () => {
      observer.unobserve(video);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="tw-w-full tw-h-full tw-flex tw-items-center tw-justify-center">
      {inView && (
        <video
          ref={videoRef}
          playsInline
          controls
          autoPlay={!capacitor.isCapacitor}
          muted
          loop
          className="tw-w-full tw-h-full tw-rounded-xl tw-object-contain"
          onClick={handleVideoClick}
        >
          <source src={src} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      )}
    </div>
  );
}

export default React.memo(DropListItemContentMediaVideo);
