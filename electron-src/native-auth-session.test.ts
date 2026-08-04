import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeNativeSessionResponse } from "./native-auth-session";

describe("native auth session response", () => {
  it("never exposes the main-process refresh token to the renderer", () => {
    const response = {
      client_type: "desktop" as const,
      address: "0xabc",
      role: null,
      access_token: "access-token",
      access_token_expires_at: "2026-06-10T00:00:00.000Z",
      native_refresh_token: "secret-main-process-refresh-token",
      refresh_token_expires_at: "2026-07-10T00:00:00.000Z",
    };

    const sanitized = sanitizeNativeSessionResponse(response);

    assert.equal(sanitized.native_refresh_token, "");
    assert.equal(
      response.native_refresh_token,
      "secret-main-process-refresh-token",
    );
    assert.equal(sanitized.access_token, response.access_token);
    assert.equal(sanitized.address, response.address);
  });
});
