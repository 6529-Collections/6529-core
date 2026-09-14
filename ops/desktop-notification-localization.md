# Desktop notification localization follow-up

Owner: Core desktop maintainers. Tracking: this document.

The desktop notification bridge and preview selector currently receive no locale.
The untranslated surface includes `Media attachment` in
`shared/desktop-notification-text.ts` (`getDesktopDropPreview`) and the generated
titles/default bodies in `renderer/helpers/notification.helpers.ts`, including
`View drop`, `View notification`, and `View profile`.

Current fallback is English. Users with a non-English locale therefore still see
English generated text in system notifications; their authored drop content and
attachment filenames retain their own language.

Remediation: pass the selected locale from `DesktopNotificationsBridge` into the
notification presentation layer, add notification message keys to the renderer
message catalog, and interpolate complete translated sentences with handle,
wave, and rating parameters. Pass translated fallback labels to the pure shared
selector rather than importing renderer locale state there. Verify supported
locales and missing-key fallback together for all notification causes.

Curly double/single quotes and alternating nested blockquotes intentionally match
the requested backend preview format. Locale-specific quote substitution needs a
separate product decision; it is not part of this Markdown conversion fix.
