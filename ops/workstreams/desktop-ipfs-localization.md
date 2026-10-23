# Desktop Local IPFS localization fallback debt

- Route/components: `/core/core-info` → `LocalIpfsSettings`, and the shared
  desktop `DesktopIpfsNavItem` navigation row.
- Untranslated surface: `desktop.localIpfs.*` and
  `navigation.desktop.ipfsDisabled` (labels, help, session state, save/restart
  feedback, errors and the disabled navigation accessible name).
- Current behavior: the settings panel uses `t(locale, key)` with canonical
  `en-US` messages. Missing entries in `en-GB`, `fr-FR`, `es-ES` and `de-DE`
  fall back to that English copy. The existing Core navigation row explicitly
  uses `DEFAULT_LOCALE`, so its accessible name remains English regardless of
  the browser locale; it is not a translated row today.
- User impact: these new desktop-only strings remain readable English for UK,
  French, Spanish and German users; they do not display raw keys or block the
  setting. Longer help/status text wraps normally rather than being truncated.
- Owner/follow-up: Core UI maintainers, tracked by the Localization note in
  [Core PR #275](https://github.com/6529-Collections/6529-core/pull/275).
- Remediation: add reviewed translations for these keys to the partial locale
  catalogs; migrate the desktop navigation row to the supported locale hook
  alongside its existing labels. Verify visible and accessible copy, full
  restart wording, and wrapping at narrow widths/200% zoom in all five locales.
- Verification gap: translated rendering and manual screen-reader/browser
  checks are not claimed by this PR; use an isolated desktop profile for that
  follow-up, not an existing production-connected profile.
