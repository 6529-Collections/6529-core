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
    setError(undefined);
    try {
      const value = await window.api.setLocalIpfsEnabled(enabled);
      if (mounted.current) setPreferences(value);
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
      <label
        className="tw-mt-4 tw-flex tw-items-center tw-gap-3"
        htmlFor={`${id}-enabled`}
      >
        <input
          id={`${id}-enabled`}
          type="checkbox"
          checked={preferences?.enabled ?? true}
          disabled={!preferences || saving}
          aria-describedby={`${id}-help ${id}-status`}
          onChange={(event) => {
            void save(event.target.checked);
          }}
          className="tw-h-5 tw-w-5 tw-accent-primary-500"
        />
        <span>{t(locale, "desktop.localIpfs.enable")}</span>
      </label>
      <p
        id={`${id}-help`}
        className="tw-mb-0 tw-mt-3 tw-text-sm tw-text-iron-400"
      >
        {t(locale, "desktop.localIpfs.help")}
      </p>
      <div id={`${id}-status`} role="status" className="tw-mt-3 tw-text-sm">
        {preferences ? (
          <>
            <p className="tw-m-0">
              {t(
                locale,
                preferences.enabledAtStartup
                  ? "desktop.localIpfs.sessionEnabled"
                  : "desktop.localIpfs.sessionDisabled"
              )}
            </p>
            {preferences.restartRequired && (
              <p className="tw-mb-0 tw-mt-2">
                {t(locale, "desktop.localIpfs.restartRequired")}
              </p>
            )}
          </>
        ) : !error ? (
          t(locale, "desktop.localIpfs.loading")
        ) : null}
        {saving && (
          <p className="tw-mb-0 tw-mt-2">
            {t(locale, "desktop.localIpfs.saving")}
          </p>
        )}
      </div>
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
