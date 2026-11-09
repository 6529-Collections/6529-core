import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { isEncryptedConnectionDeviceSetup } from "../shared/connection-device-setup";
import { sanitizeNativeSessionResponse } from "./native-auth-session";

const source = ts.createSourceFile(
  "index.ts",
  fs.readFileSync(path.join(process.cwd(), "electron-src/index.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const functions = [
  "isNativeConnectionShareRequest",
  "isNativeSessionLoginResponse",
  "nativeCreateConnectionShare",
  "nativeRedeemConnectionShare",
];
const declarations = source.statements.filter(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && functions.includes(node.name?.text ?? ""),
);
assert.equal(
  declarations.length,
  functions.length,
  "Native sharing functions moved or were removed; update this harness",
);
for (const declaration of declarations) {
  assert.ok(
    declaration.body?.statements.length,
    `${declaration.name?.text} must have an implementation`,
  );
}
const compiled = ts.transpileModule(
  declarations.map((node) => node.getText(source)).join("\n"),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;
const envelope = `v1.${"i".repeat(16)}.${"c".repeat(40)}`;

test("only bounded versioned ciphertext is accepted across IPC", () => {
  assert.equal(isEncryptedConnectionDeviceSetup(envelope), true);
  for (const value of [
    null,
    {},
    "private-key",
    "v1.short.data",
    `v1.${"i".repeat(16)}.${"c".repeat(32768)}`,
  ]) {
    assert.equal(isEncryptedConnectionDeviceSetup(value), false);
  }
});

test("native sharing carries ciphertext and native redeem hides refresh credentials", async () => {
  const requests: Array<{ endpoint: string; body: Record<string, unknown> }> =
    [];
  const persisted: unknown[] = [];
  const shared = {
    target_client_type: "desktop",
    client_type: "desktop",
    client_address: "0xabc",
    encrypted_device_setup: envelope,
  };
  const context = vm.createContext({
    isEncryptedConnectionDeviceSetup,
    sanitizeNativeSessionResponse,
    isRefreshTokenClientType: (value: unknown) =>
      value === "native" || value === "desktop",
    hasOptionalAccessToken: () => true,
    hasOptionalConnectionShareSourceProof: () => true,
    getNativeConnectionShareSourceProof: () => ({
      native_refresh_token: "main-only-source-token",
    }),
    isNativeConnectionShareResponse: () => true,
    setNativeRefreshTokenForSession: (response: unknown) =>
      persisted.push(response),
    postNativeAuthApi: async (request: (typeof requests)[number]) => {
      requests.push(request);
      return request.endpoint.endsWith("/redeem")
        ? {
            client_type: "desktop",
            address: "0xabc",
            role: null,
            access_token: "access",
            access_token_expires_at: "2026-12-01",
            native_refresh_token: "main-only-target-token",
            refresh_token_expires_at: "2026-12-01",
            encrypted_device_setup: envelope,
          }
        : { target_client_type: "desktop" };
    },
  });
  vm.runInContext(compiled, context);
  assert.equal(context.isNativeConnectionShareRequest(shared), true);
  assert.equal(
    context.isNativeConnectionShareRequest({
      ...shared,
      encrypted_device_setup: "plaintext",
    }),
    false,
  );
  await context.nativeCreateConnectionShare(shared);
  assert.equal(requests[0].body.encrypted_device_setup, envelope);
  assert.equal(requests[0].body.native_refresh_token, "main-only-source-token");
  await context.nativeCreateConnectionShare({
    target_client_type: "desktop",
    client_type: "desktop",
    client_address: "0xabc",
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      requests[1].body,
      "encrypted_device_setup",
    ),
    false,
  );
  const response = await context.nativeRedeemConnectionShare({
    connection_share_code: "one-time-code",
    target_client_type: "desktop",
  });
  assert.equal(persisted.length, 1);
  assert.equal(response.encrypted_device_setup, envelope);
  assert.equal(response.native_refresh_token, "");
});
