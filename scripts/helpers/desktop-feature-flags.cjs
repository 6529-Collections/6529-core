// Match the approved production messaging rollout in frontend #4680.
// Explicit build/dev flags override stale shell or .env values for both backends.
const DESKTOP_FEATURE_FLAGS = Object.freeze({
  NEXT_PUBLIC_E2EE_DM_ENABLED: "true",
  NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES: "true",
  NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS: "true",
});

function getDesktopFeatureFlags(backendTarget) {
  if (backendTarget !== "live" && backendTarget !== "test") {
    throw new Error(`Unknown backend target "${backendTarget}".`);
  }
  return { ...DESKTOP_FEATURE_FLAGS };
}

module.exports = { getDesktopFeatureFlags };
