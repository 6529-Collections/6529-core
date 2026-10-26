"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t } from "@/i18n/messages";
import type { LocalIpfsPreferencesSnapshot } from "@/shared/ipfs-status";

export default function LocalIpfsSettings() {
  const locale = useBrowserLocale();
  const id = useId();
  const [preferences, setPreferences] =
    useState<LocalIpfsPreferencesSnapshot>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"load" | "save">();
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void window.api.getLocalIpfsPreferences().then(
      (value) => {
        if (!cancelled) setPreferences(value);
      },
      () => {
        if (!cancelled) setError("load");
      }
    );
    return () => {
      cancelled = true;
      mounted.current = false;
    };
  }, []);

  async function save(enabled: boolean) {
    if (inFlight.current || !preferences) return;
    inFlight.current = true;
    setSaving(true);
    setSaved(false);
    setError(undefined);
    try {
      const value = await window.api.setLocalIpfsEnabled(enabled);
      if (mounted.current) {
        setPreferences(value);
        setSaved(true);
      }
    } catch {
      if (mounted.current) setError("save");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="tw-rounded-xl tw-bg-iron-950 tw-p-5 tw-ring-1 tw-ring-inset tw-ring-iron-800"
    >
      <h2 id={`${id}-title`} className="tw-m-0 tw-text-xl tw-font-semibold">
        {t(locale, "desktop.localIpfs.title")}
      </h2>
      {preferences && (
        <label
          className="tw-mt-4 tw-flex tw-items-center tw-gap-3"
          htmlFor={`${id}-enabled`}
        >
          <input
            id={`${id}-enabled`}
            type="checkbox"
            checked={preferences.enabled}
            aria-disabled={saving}
            aria-describedby={`${id}-help ${id}-session`}
            onChange={(event) => {
              void save(event.target.checked);
            }}
            className="tw-h-5 tw-w-5 tw-accent-primary-500"
          />
          <span>{t(locale, "desktop.localIpfs.enable")}</span>
        </label>
      )}
      <p
        id={`${id}-help`}
        className="tw-mb-0 tw-mt-3 tw-text-sm tw-text-iron-400"
      >
        {t(locale, "desktop.localIpfs.help")}
      </p>
      <p id={`${id}-session`} className="tw-mb-0 tw-mt-3 tw-text-sm">
        {preferences &&
          t(
            locale,
            preferences.enabledAtStartup
              ? "desktop.localIpfs.sessionEnabled"
              : "desktop.localIpfs.sessionDisabled"
          )}
      </p>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="tw-mb-0 tw-mt-2 tw-text-sm"
      >
        {!error &&
          (saving
            ? t(locale, "desktop.localIpfs.saving")
            : preferences && preferences.restartRequired
              ? t(locale, "desktop.localIpfs.restartRequired")
              : saved
                ? t(locale, "desktop.localIpfs.saved")
                : !preferences
                  ? t(locale, "desktop.localIpfs.loading")
                  : null)}
      </p>
      {error && (
        <p role="alert" className="tw-mb-0 tw-mt-3 tw-text-sm tw-text-red">
          {t(
            locale,
            error === "load"
              ? "desktop.localIpfs.loadError"
              : "desktop.localIpfs.saveError"
          )}
        </p>
      )}
    </section>
  );
}
