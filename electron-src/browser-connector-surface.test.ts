import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAppRouteProviderFeatures,
  isBrowserConnectorRoute,
} from "../renderer/components/providers/app-route-provider-features";

describe("browser connector surface", () => {
  it("isolates the connector route from every app-global UI feature", () => {
    assert.equal(isBrowserConnectorRoute("/browser-connector"), true);
    assert.equal(isBrowserConnectorRoute("/browser-connector/request"), true);
    assert.deepEqual(getAppRouteProviderFeatures("/browser-connector"), {
      enableVersionCheck: false,
      enableWalletAuthentication: false,
      enableCookieConsent: false,
      enableMyStream: false,
    });
  });

  it("does not isolate normal routes or lookalike path prefixes", () => {
    assert.equal(isBrowserConnectorRoute("/browser-connector-preview"), false);
    assert.deepEqual(getAppRouteProviderFeatures("/"), {
      enableVersionCheck: true,
      enableWalletAuthentication: true,
      enableCookieConsent: true,
      enableMyStream: true,
    });
  });
});
