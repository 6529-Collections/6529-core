const assert = require("node:assert/strict");
const { test } = require("node:test");
const { getDesktopFeatureFlags } = require("./desktop-feature-flags.cjs");
const { getBuildEnvironment } = require("../desktop-build-target.cjs");
const { getDevEnvironment } = require("../desktop-dev-target.cjs");

const STAGING_KEY_FIXTURE = "fixture-staging-key";

function withEnv(overrides, run) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = overrides[key];
  }
  try {
    return run();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("live builds enable encrypted and signed messages but not app grants", () => {
  assert.deepEqual(getDesktopFeatureFlags("live"), {
    NEXT_PUBLIC_E2EE_DM_ENABLED: "true",
    NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES: "true",
    NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS: "",
  });
});

test("test-backend builds also enable app device grants", () => {
  assert.deepEqual(getDesktopFeatureFlags("test"), {
    NEXT_PUBLIC_E2EE_DM_ENABLED: "true",
    NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES: "true",
    NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS: "true",
  });
});

test("an unknown backend target is rejected", () => {
  assert.throws(() => getDesktopFeatureFlags("prod"), /Unknown backend target/);
});

test("distribution builds bake the flags of their backend target", () => {
  const config = { appEnvironment: "staging", env: {} };
  withEnv(
    {
      STAGING_API_KEY: STAGING_KEY_FIXTURE,
      // A flag exported by the shell must not turn app grants on for live.
      NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS: "true",
    },
    () => {
      const live = getBuildEnvironment(config, "live");
      assert.equal(live.NEXT_PUBLIC_E2EE_DM_ENABLED, "true");
      assert.equal(live.NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES, "true");
      assert.equal(live.NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS, "");
      assert.equal(live.STAGING_API_KEY, "");

      const testBackend = getBuildEnvironment(config, "test");
      assert.equal(testBackend.NEXT_PUBLIC_E2EE_DM_ENABLED, "true");
      assert.equal(testBackend.NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES, "true");
      assert.equal(testBackend.NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS, "true");
    },
  );
});

test("production builds keep the live flags", () => {
  withEnv({ STAGING_API_KEY: "" }, () => {
    const production = getBuildEnvironment(
      { appEnvironment: "production", env: {} },
      "live",
    );
    assert.equal(production.NEXT_PUBLIC_E2EE_DM_ENABLED, "true");
    assert.equal(production.NEXT_PUBLIC_FEATURE_SIGNED_MESSAGES, "true");
    assert.equal(production.NEXT_PUBLIC_FEATURE_APP_DEVICE_GRANTS, "");
  });
});

test("dev runs bake the same flags as builds for each backend", () => {
  withEnv({ STAGING_API_KEY: STAGING_KEY_FIXTURE }, () => {
    for (const backendTarget of ["live", "test"]) {
      const env = getDevEnvironment(backendTarget);
      for (const [key, value] of Object.entries(
        getDesktopFeatureFlags(backendTarget),
      )) {
        assert.equal(env[key], value, `${backendTarget} ${key}`);
      }
    }
  });
});
