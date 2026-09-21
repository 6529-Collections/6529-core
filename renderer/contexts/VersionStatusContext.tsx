"use client";

import { useSearchParams } from "next/navigation";
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const VersionStatusContext = createContext(false);

function DesktopUpdatePreview({
  onChange,
}: {
  readonly onChange: (requested: boolean) => void;
}) {
  const searchParams = useSearchParams();
  const requested =
    searchParams.get("showDesktopUpdate") === "true" ||
    searchParams.get("showDesktopUpdateModal") === "true";
  useEffect(() => {
    onChange(requested);
  }, [requested, onChange]);
  return null;
}

export function VersionStatusProvider({
  children,
  enabled = true,
}: {
  readonly children: ReactNode;
  readonly enabled?: boolean;
}) {
  const [available, setAvailable] = useState(false);
  const [previewAllowed, setPreviewAllowed] = useState(false);
  const [previewRequested, setPreviewRequested] = useState(false);
  // Core updates come from Electron, never the deployed website's build ID.
  useEffect(() => {
    if (!enabled || !window.updater) return;
    let active = true;
    const onAvailable = () => setAvailable(true);
    const onNotAvailable = () => setAvailable(false);
    window.updater.onUpdateAvailable(onAvailable);
    window.updater.onUpdateNotAvailable(onNotAvailable);
    window.updater.checkUpdates();
    void window.api
      .getInfo()
      .then((info) => {
        const { environment } = info as { environment?: string };
        if (active)
          setPreviewAllowed(
            ["dev", "local", "staging"].includes(environment ?? "")
          );
      })
      .catch(() => {
        /* Preview stays disabled when app info is unavailable. */
      });
    return () => {
      active = false;
      window.updater.offUpdateAvailable(onAvailable);
      window.updater.offUpdateNotAvailable(onNotAvailable);
    };
  }, [enabled]);
  const preview = previewAllowed && previewRequested;
  return (
    <VersionStatusContext.Provider value={enabled && (available || preview)}>
      {enabled && previewAllowed && (
        <Suspense fallback={null}>
          <DesktopUpdatePreview onChange={setPreviewRequested} />
        </Suspense>
      )}
      {children}
    </VersionStatusContext.Provider>
  );
}

export const useVersionStatus = () => useContext(VersionStatusContext);
