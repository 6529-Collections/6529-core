import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
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

test("standalone renderer build and dev apply desktop flags despite stale shell values", () => {
  const factoryStatement = source.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === "nextConfigFactory",
      ),
  );
  assert.ok(factoryStatement);
  const factoryCode = ts.transpileModule(
    `${factoryStatement.getText(source)}; globalThis.factory = nextConfigFactory;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const { getDesktopFeatureFlags } = createRequire(
    path.resolve("package.json"),
  )("./scripts/helpers/desktop-feature-flags.cjs");
  for (const phase of ["build", "dev"]) {
    for (const backend of ["live", "test"]) {
      let baked: Record<string, string> | undefined;
      const env = {
        BACKEND_TARGET: backend,
        STAGING_API_KEY: "fixture",
        ...Object.fromEntries(
          Object.keys(getDesktopFeatureFlags(backend)).map((key) => [
            key,
            "false",
          ]),
        ),
      };
      const context = vm.createContext({
        process: { env },
        __dirname: "/fixture",
        path,
        MAIN_PUBLIC_RUNTIME_PATH: "/fixture/native.json",
        fs: { existsSync: () => false },
        dotenv: { config: () => {} },
        PHASE_PRODUCTION_BUILD: "build",
        PHASE_DEVELOPMENT_SERVER: "dev",
        PHASE_PRODUCTION_SERVER: "server",
        logOnce: () => {},
        computeVersionFromPkg: () => "0.3.16",
        resolveAssetsFlagFromEnv: () => false,
        getCoreScheme: () => "localcore6529",
        getDesktopFeatureFlags,
        persistPrivateRuntimeConfig: () => {},
        publicEnvSchema: {
          _def: { shape: () => env },
          safeParse: (data: Record<string, string>) => ({
            success: true,
            data,
          }),
        },
        persistBakedArtifacts: (data: Record<string, string>) => {
          baked = data;
        },
        sharedConfig: () => ({}),
        getAssetPrefix: () => "",
      });
      vm.runInContext(factoryCode, context);
      const config = context.factory(phase);
      for (const output of [
        baked,
        JSON.parse(config.env.PUBLIC_RUNTIME),
        JSON.parse(config.env.PUBLIC_RUNTIME_BROWSER),
      ]) {
        for (const [key, expected] of Object.entries(
          getDesktopFeatureFlags(backend),
        ))
          assert.equal(output[key], expected);
      }
    }
  }
});
