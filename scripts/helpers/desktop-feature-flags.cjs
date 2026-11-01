// Renderer feature flags baked into desktop builds, per backend target.
//
// Encrypted messages (D109) and signed messages are on in production on
// 6529.io, so both backends enable them. App device grants (the EIP-712 grant
// that turns on signed and encrypted messages in 6529 Mobile and Desktop) wait
// for owner approval of the grant wording, so only test-backend builds enable
// them. An empty string switches a flag off even when the shell exports it.
const DESKTOP_FEATURE_FLAGS = Object.freeze({
  live: Object.freeze({
    NEXT_PUBLIC_E2EE_DM_ENABLED: "true",
    NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES: "true",
    NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS: "",
  }),
  test: Object.freeze({
    NEXT_PUBLIC_E2EE_DM_ENABLED: "true",
    NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES: "true",
    NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS: "true",
  }),
});

function getDesktopFeatureFlags(backendTarget) {
  const flags = DESKTOP_FEATURE_FLAGS[backendTarget];
  if (!flags) {
    throw new Error(`Unknown backend target "${backendTarget}".`);
  }
  return { ...flags };
}

module.exports = { getDesktopFeatureFlags };
