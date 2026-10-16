import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NativeAuthApiError,
  serializeNativeAuthResult,
  unwrapNativeAuthResult,
} from "../shared/native-auth-result";
import {
  getRateLimitCooldownMs,
  isRateLimitError,
} from "../renderer/services/auth/session-refresh-rate-limit.utils";
import { sanitizeNativeSessionResponse } from "./native-auth-session";

describe("native auth IPC results", () => {
  it("preserves a terminal 401 through plain-data transport", async () => {
    const result = await serializeNativeAuthResult(async () => {
      throw new NativeAuthApiError(401, "Invalid session");
    });
    // Electron cannot preserve custom Error properties across these boundaries.
    const transported = structuredClone(structuredClone(result));
    assert.throws(
      () => unwrapNativeAuthResult(transported),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Invalid session");
        assert.ok("status" in error);
        assert.equal(error.status, 401);
        return true;
      },
    );
  });

  it("preserves a rate limit and Retry-After for the existing renderer policy", async () => {
    const result = await serializeNativeAuthResult(async () => {
      throw new NativeAuthApiError(429, "Too many requests", "12");
    });
    assert.throws(
      () => unwrapNativeAuthResult(structuredClone(result)),
      (error: unknown) => {
        assert.equal(isRateLimitError(error), true);
        assert.equal(getRateLimitCooldownMs(error), 12_000);
        return true;
      },
    );
  });

  it("retains server failures as server failures rather than expired sessions", async () => {
    const result = await serializeNativeAuthResult(async () => {
      throw new NativeAuthApiError(503, "Service unavailable");
    });
    assert.throws(
      () => unwrapNativeAuthResult(structuredClone(result)),
      (error: unknown) => {
        assert.ok(error instanceof Error && "status" in error);
        assert.equal(error.status, 503);
        assert.equal(isRateLimitError(error), false);
        return true;
      },
    );
  });

  it("transports only the allowed API error fields", async () => {
    const error = Object.assign(
      new NativeAuthApiError(401, "Invalid session"),
      {
        request: { native_refresh_token: "private-refresh-token" },
        responseBody: { internal: "private-response" },
      },
    );
    const result = await serializeNativeAuthResult(async () => {
      throw error;
    });
    assert.deepEqual(structuredClone(result), {
      kind: "native-auth-api-error",
      status: 401,
      message: "Invalid session",
    });
  });

  it("leaves sanitized successful sessions and void results unchanged", async () => {
    const session = sanitizeNativeSessionResponse({
      access_token: "access-token",
      native_refresh_token: "main-process-only-refresh-token",
    });
    const result = await serializeNativeAuthResult(async () => session);
    assert.deepEqual(unwrapNativeAuthResult(structuredClone(result)), {
      access_token: "access-token",
      native_refresh_token: "",
    });
    const logout = await serializeNativeAuthResult(async () => undefined);
    assert.equal(unwrapNativeAuthResult(structuredClone(logout)), undefined);
  });

  it("does not misclassify transport or validation errors as authentication failures", async () => {
    const error = new Error("Native auth API request timed out");
    await assert.rejects(
      serializeNativeAuthResult(async () => {
        throw error;
      }),
      (actual: unknown) => actual === error,
    );
  });
});
