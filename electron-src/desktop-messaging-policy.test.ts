import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Execute the actual header generator and headers() method without loading
// Next or its build/runtime side effects.
const source = ts.createSourceFile(
  "next.config.ts",
  fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const constants = new Set([
  "DEFAULT_MEDIA_RESOLVER_ENDPOINT",
  "ARWEAVE_GATEWAY_HOSTS",
  "ARWEAVE_GATEWAY_CSP_SOURCES",
  "IPFS_FALLBACK_GATEWAY_HOSTS",
  "IPFS_FALLBACK_MEDIA_SOURCES",
  "IPFS_FALLBACK_FRAME_SOURCES",
]);
const functions = new Set([
  "joinSources",
  "isLocalhostHostname",
  "getConfiguredConnectSource",
  "getConfiguredIpfsGatewaySource",
  "getMediaResolverSource",
  "createSecurityHeaders",
]);
const declarations: string[] = [];
let headers: ts.MethodDeclaration | undefined;
for (const statement of source.statements) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        constants.has(declaration.name.text)
      ) {
        declarations.push(`const ${declaration.getText(source)};`);
      }
    }
  } else if (ts.isFunctionDeclaration(statement)) {
    if (functions.has(statement.name?.text ?? ""))
      declarations.push(statement.getText(source));
    if (statement.name?.text === "sharedConfig") {
      const visit = (node: ts.Node) => {
        if (
          ts.isMethodDeclaration(node) &&
          node.name.getText(source) === "headers"
        )
          headers = node;
        ts.forEachChild(node, visit);
      };
      visit(statement);
    }
  }
}
assert.equal(
  declarations.length,
  constants.size + functions.size,
  "Header dependencies moved; update this harness",
);
assert.ok(headers, "sharedConfig.headers moved; update this harness");
const compiled = ts.transpileModule(
  [...declarations, `globalThis.config = {${headers.getText(source)}};`].join(
    "\n",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

test("production MLS WASM permission follows the baked flag without enabling JavaScript eval", async () => {
  for (const enabled of [true, false]) {
    const context = vm.createContext({
      URL,
      publicEnv: { NEXT_PUBLIC_E2EE_DM_ENABLED: enabled ? "true" : "" },
      // Deliberately opposite: the runtime shell must not determine this policy.
      process: {
        env: {
          NODE_ENV: "production",
          NEXT_PUBLIC_E2EE_DM_ENABLED: enabled ? "" : "true",
        },
      },
      meebits445Headers: { source: "/fixture", headers: [] },
    });
    vm.runInContext(compiled, context);
    const routes: Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }> = await context.config.headers();
    const csp = routes
      .find((route) => route.source === "/:path*")
      ?.headers.find(
        (header) => header.key === "Content-Security-Policy",
      )?.value;
    assert.ok(csp);
    const scripts = csp
      .split(";")
      .find((directive) => directive.trim().startsWith("script-src "));
    assert.ok(scripts);
    assert.equal(scripts.includes("'wasm-unsafe-eval'"), enabled);
    assert.equal(scripts.includes("'unsafe-eval'"), false);
  }
});
