"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useBrowserLocale } from "@/hooks/useBrowserLocale";
import { t, tRich } from "@/i18n/messages";
import type { LocalIpfsPreferencesSnapshot } from "@/shared/ipfs-status";

export default function LocalIpfsSettings() {
  const locale = useBrowserLocale();
  const id = useId();
  const [preferences, setPreferences] =
    useState<LocalIpfsPreferencesSnapshot>();
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<"load" | "save" | "restart">();
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

  async function restart() {
    if (inFlight.current || !preferences?.restartRequired) return;
    inFlight.current = true;
    setRestarting(true);
    setError(undefined);
    try {
      await window.api.restartForLocalIpfs();
    } catch {
      if (mounted.current) {
        inFlight.current = false;
        setRestarting(false);
        setError("restart");
      }
    }
  }

  const sessionMessage = preferences?.restartRequired
    ? preferences.enabled
      ? "desktop.localIpfs.restartEnable"
      : "desktop.localIpfs.restartDisable"
    : preferences?.enabledAtStartup
      ? "desktop.localIpfs.sessionEnabled"
      : "desktop.localIpfs.sessionDisabled";
  const busy = saving || restarting;
  const stateWords = {
    on: t(locale, "desktop.localIpfs.stateOn"),
    off: t(locale, "desktop.localIpfs.stateOff"),
    onLower: t(locale, "desktop.localIpfs.stateOnLower"),
    offLower: t(locale, "desktop.localIpfs.stateOffLower"),
  };
  const emphasizedStates = Object.fromEntries(
    Object.entries(stateWords).map(([key, word]) => [
      key,
      <strong key={key} className="tw-font-bold">
        {word}
      </strong>,
    ])
  );
  const sessionText = t(locale, sessionMessage, stateWords);

  return (
    <section
      id="local-ipfs"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      className="tw-scroll-mt-6 tw-rounded-xl tw-bg-iron-950 tw-p-4 tw-text-white tw-ring-1 tw-ring-inset tw-ring-iron-800 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400"
    >
      <div className="tw-flex tw-items-start tw-justify-between tw-gap-4">
        <div className="tw-min-w-0 tw-flex-1">
          <h2 id={`${id}-title`} className="tw-m-0 tw-text-xl tw-font-semibold">
            {t(locale, "desktop.localIpfs.title")}
          </h2>
          {preferences && (
            <div className="tw-mt-1 tw-flex tw-items-center tw-gap-3">
              <div className="tw-grid tw-min-w-0 tw-text-sm">
                {/* Reserve both pending messages' wrapping height at this width. */}
                <span
                  aria-hidden="true"
                  className="tw-invisible tw-col-start-1 tw-row-start-1"
                >
                  {tRich(
                    locale,
                    "desktop.localIpfs.restartEnable",
                    emphasizedStates
                  )}
                </span>
                <span
                  aria-hidden="true"
                  className="tw-invisible tw-col-start-1 tw-row-start-1"
                >
                  {tRich(
                    locale,
                    "desktop.localIpfs.restartDisable",
                    emphasizedStates
                  )}
                </span>
                <span
                  id={`${id}-session`}
                  className="tw-col-start-1 tw-row-start-1 tw-self-center"
                >
                  {tRich(locale, sessionMessage, emphasizedStates)}
                </span>
              </div>
              <span className="tailwind-scope tw-inline-flex tw-min-h-9 tw-min-w-28 tw-flex-shrink-0 tw-items-center">
                <button
                  type="button"
                  onClick={() => {
                    void restart();
                  }}
                  disabled={busy || !preferences.restartRequired}
                  aria-hidden={!preferences.restartRequired}
                  className={`tw-min-h-[30px] tw-rounded-lg tw-border-0 tw-bg-iron-50 tw-px-3 tw-py-1 tw-text-sm tw-font-medium tw-leading-5 tw-text-iron-950 hover:tw-bg-iron-200 focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-primary-400 disabled:tw-cursor-wait disabled:tw-opacity-60 ${preferences.restartRequired ? "" : "tw-invisible"}`}
                >
                  {t(
                    locale,
                    restarting
                      ? "desktop.localIpfs.restarting"
                      : "desktop.localIpfs.restartNow"
                  )}
                </button>
              </span>
            </div>
          )}
        </div>
        {preferences && (
          <label
            className={`tw-relative tw-inline-flex tw-min-h-11 tw-w-11 tw-flex-shrink-0 tw-items-center tw-rounded-full ${busy ? "tw-cursor-wait tw-opacity-60" : "tw-cursor-pointer"}`}
            htmlFor={`${id}-enabled`}
          >
            <span className="tw-sr-only">
              {t(locale, "desktop.localIpfs.enable")}
            </span>
            <input
              id={`${id}-enabled`}
              type="checkbox"
              role="switch"
              checked={preferences.enabled}
              aria-disabled={busy}
              aria-describedby={`${id}-help ${id}-session`}
              onChange={(event) => {
                void save(event.target.checked);
              }}
              className="tw-peer tw-sr-only"
            />
            <span
              aria-hidden="true"
              className={`tw-inline-flex tw-h-6 tw-w-11 tw-items-center tw-rounded-full tw-p-1 tw-ring-1 tw-ring-inset tw-ring-white/20 tw-transition-colors peer-focus-visible:tw-ring-2 peer-focus-visible:tw-ring-primary-300 peer-focus-visible:tw-ring-offset-2 peer-focus-visible:tw-ring-offset-iron-950 motion-reduce:tw-transition-none ${preferences.enabled ? "tw-bg-primary-500" : "tw-bg-iron-600"}`}
            >
              <span
                className={`tw-size-4 tw-rounded-full tw-bg-iron-50 tw-shadow-sm tw-transition-transform motion-reduce:tw-transition-none ${preferences.enabled ? "tw-translate-x-5" : "tw-translate-x-0"}`}
              />
            </span>
          </label>
        )}
      </div>
      <p id={`${id}-help`} className="tw-mb-0 tw-mt-2 tw-text-sm">
        {t(locale, "desktop.localIpfs.summary")}
      </p>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={
          !preferences && !error
            ? "tw-mb-0 tw-mt-2 tw-text-sm tw-font-medium"
            : "tw-sr-only"
        }
      >
        {!error &&
          (restarting
            ? t(locale, "desktop.localIpfs.restarting")
            : saving
              ? t(locale, "desktop.localIpfs.saving")
              : preferences && preferences.restartRequired
                ? sessionText
                : saved
                  ? t(locale, "desktop.localIpfs.saved")
                  : !preferences
                    ? t(locale, "desktop.localIpfs.loading")
                    : null)}
      </p>
      <details className="tw-mt-1 tw-text-sm tw-text-iron-300">
        <summary className="tw-w-fit tw-cursor-pointer tw-rounded-md tw-py-1 hover:tw-text-white focus-visible:tw-text-white focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-primary-400">
          {t(locale, "desktop.localIpfs.moreDetails")}
        </summary>
        <p className="tw-mb-0 tw-mt-1">{t(locale, "desktop.localIpfs.help")}</p>
      </details>
      {error && (
        <p role="alert" className="tw-mb-0 tw-mt-3 tw-text-sm tw-text-red">
          {t(
            locale,
            error === "load"
              ? "desktop.localIpfs.loadError"
              : error === "restart"
                ? "desktop.localIpfs.restartError"
                : "desktop.localIpfs.saveError"
          )}
        </p>
      )}
    </section>
  );
}
