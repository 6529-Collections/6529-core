import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ShareMobileApp } from "../components/header/share/HeaderShareMobileApps";
import ClientOnly from "../components/client-only/ClientOnly";
import { DeepLinkScope } from "../hooks/useDeepLinkNavigation";

const OpenMobilePage = () => {
  const router = useRouter();
  const { path } = router.query;

  const [decodedPath, setDecodedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined" || !path) {
      return;
    }

    const appScheme = "mobile6529";

    const raw = Array.isArray(path) ? path[0] : path;
    const decoded = decodeURIComponent(raw);
    const deepLink = `${appScheme}://${DeepLinkScope.NAVIGATE}${decoded}`;

    setDecodedPath(decoded);
    window.location.href = deepLink;
  }, [router.isReady, path]);

  const handleBack = () => {
    if (decodedPath) {
      window.location.href = `${window.location.origin}${decodedPath}`;
    } else {
      window.location.href = window.location.origin;
    }
  };

  const printShareMobileApps = () => {
    const shareIos = <ShareMobileApp platform="ios" target="_self" />;
    const shareAndroid = <ShareMobileApp platform="android" target="_self" />;

    const userAgent =
      typeof navigator === "undefined" ? "" : navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /android/i.test(userAgent);

    if (isIos) {
      return shareIos;
    } else if (isAndroid) {
      return shareAndroid;
    }

    return (
      <>
        {shareIos}
        {shareAndroid}
      </>
    );
  };

  return (
    <ClientOnly>
      <div className="tailwind-scope tw-flex tw-flex-col tw-items-center tw-justify-center tw-h-screen tw-text-center tw-p-4 tw-gap-10">
        <p className="tw-text-2xl tw-font-bold tw-animate-pulse">
          Opening 6529 Mobile...
        </p>
        <div className="tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-1">
          <p className="tw-text-xl tw-font-bold">Get 6529 Mobile</p>
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-center tw-gap-4">
            {printShareMobileApps()}
          </div>
        </div>
        <button onClick={handleBack} className="tw-mt-10 btn-link">
          Back to 6529.io
        </button>
      </div>
    </ClientOnly>
  );
};

export default OpenMobilePage;
