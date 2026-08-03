#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const repositoryRoot = path.resolve(__dirname, "..");
const failures = [];

function parseSource(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  const sourceFile = ts.createSourceFile(
    absolutePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const diagnostic of sourceFile.parseDiagnostics) {
    failures.push(
      `${relativePath}: cannot parse contract source (${ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        " ",
      )})`,
    );
  }
  return sourceFile;
}

function findDescendant(node, predicate) {
  if (predicate(node)) {
    return node;
  }
  let match;
  ts.forEachChild(node, (child) => {
    if (!match) {
      match = findDescendant(child, predicate);
    }
  });
  return match;
}

function findFunction(sourceFile, functionName) {
  return findDescendant(
    sourceFile,
    (node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === functionName,
  );
}

function callsIdentifier(node, identifier) {
  return Boolean(
    findDescendant(
      node,
      (candidate) =>
        ts.isCallExpression(candidate) &&
        ts.isIdentifier(candidate.expression) &&
        candidate.expression.text === identifier,
    ),
  );
}

function returnsStringLiteral(node, value) {
  return Boolean(
    findDescendant(
      node,
      (candidate) =>
        ts.isReturnStatement(candidate) &&
        candidate.expression !== undefined &&
        ts.isStringLiteral(candidate.expression) &&
        candidate.expression.text === value,
    ),
  );
}

function requiresBridgeMethod(node, methodName) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (
        !ts.isCallExpression(candidate) ||
        !ts.isIdentifier(candidate.expression) ||
        candidate.expression.text !== "requireDesktopAuthBridgeMethod"
      ) {
        return false;
      }
      const methodArgument = candidate.arguments[0];
      return (
        methodArgument !== undefined &&
        ts.isStringLiteral(methodArgument) &&
        methodArgument.text === methodName
      );
    }),
  );
}

function hasIpcCall(sourceFile, receiver, method, channel) {
  return Boolean(
    findDescendant(sourceFile, (candidate) => {
      if (
        !ts.isCallExpression(candidate) ||
        !ts.isPropertyAccessExpression(candidate.expression) ||
        !ts.isIdentifier(candidate.expression.expression) ||
        candidate.expression.expression.text !== receiver ||
        candidate.expression.name.text !== method
      ) {
        return false;
      }
      const channelArgument = candidate.arguments[0];
      return (
        channelArgument !== undefined &&
        ts.isStringLiteral(channelArgument) &&
        channelArgument.text === channel
      );
    }),
  );
}

function getInterfaceMember(sourceFile, interfaceName, memberName) {
  const declaration = findDescendant(
    sourceFile,
    (node) =>
      ts.isInterfaceDeclaration(node) && node.name.text === interfaceName,
  );
  if (!declaration) {
    return undefined;
  }
  return declaration.members.find((member) => {
    const name = member.name;
    return name && ts.isIdentifier(name) && name.text === memberName;
  });
}

function assertContract(condition, relativePath, message) {
  if (!condition) {
    failures.push(`${relativePath}: ${message}`);
  }
}

const sessionUtilsPath = "renderer/services/auth/session-v2.utils.ts";
const sessionUtils = parseSource(sessionUtilsPath);
const clientTypeFunction = findFunction(sessionUtils, "getSessionClientType");
assertContract(
  clientTypeFunction &&
    callsIdentifier(clientTypeFunction, "isElectron") &&
    returnsStringLiteral(clientTypeFunction, "desktop"),
  sessionUtilsPath,
  "getSessionClientType must return desktop for Electron",
);

for (const [functionName, bridgeMethod] of [
  ["loginWithSessionV2", "sessionLogin"],
  ["executeSessionRefreshV2", "sessionRefresh"],
  ["createConnectionShare", "createConnectionShare"],
  ["createLegacyDesktopConnectionShare", "createLegacyDesktopConnectionShare"],
  ["logoutSessionV2", "sessionLogout"],
  ["redeemConnectionShare", "redeemConnectionShare"],
]) {
  const declaration = findFunction(sessionUtils, functionName);
  assertContract(
    declaration && requiresBridgeMethod(declaration, bridgeMethod),
    sessionUtilsPath,
    `${functionName} must require the ${bridgeMethod} desktop bridge`,
  );
}

for (const functionName of [
  "executeSessionRefreshV2",
  "createConnectionShare",
  "createLegacyDesktopConnectionShare",
]) {
  const declaration = findFunction(sessionUtils, functionName);
  assertContract(
    declaration &&
      callsIdentifier(declaration, "runDesktopBridgeRequestWithAbort"),
    sessionUtilsPath,
    `${functionName} must preserve caller cancellation across the desktop bridge`,
  );
}

const ipcChannels = [
  "native-auth:remove-refresh-token",
  "native-auth:session-login",
  "native-auth:session-refresh",
  "native-auth:session-logout",
  "native-auth:connection-share",
  "native-auth:connection-share:legacy-desktop",
  "native-auth:connection-share:redeem",
];
const preloadPath = "electron-src/preload.ts";
const preloadSource = parseSource(preloadPath);
const mainPath = "electron-src/index.ts";
const mainSource = parseSource(mainPath);
for (const channel of ipcChannels) {
  assertContract(
    hasIpcCall(preloadSource, "ipcRenderer", "invoke", channel),
    preloadPath,
    `preload must expose ${channel}`,
  );
  assertContract(
    hasIpcCall(mainSource, "ipcMain", "handle", channel),
    mainPath,
    `main process must handle ${channel}`,
  );
}

for (const functionName of [
  "nativeSessionLogin",
  "nativeSessionRefresh",
  "nativeRedeemConnectionShare",
]) {
  const declaration = findFunction(mainSource, functionName);
  assertContract(
    declaration &&
      callsIdentifier(declaration, "setNativeRefreshTokenForSession"),
    mainPath,
    `${functionName} must persist the refresh token in the main process`,
  );
  assertContract(
    declaration &&
      callsIdentifier(declaration, "sanitizeNativeSessionResponse"),
    mainPath,
    `${functionName} must sanitize its renderer response`,
  );
}

const preloadTypesPath = "shared/preload-types.ts";
const preloadTypes = parseSource(preloadTypesPath);
for (const memberName of [
  "removeRefreshToken",
  "sessionLogin",
  "sessionRefresh",
  "sessionLogout",
  "createConnectionShare",
  "createLegacyDesktopConnectionShare",
  "redeemConnectionShare",
]) {
  assertContract(
    Boolean(getInterfaceMember(preloadTypes, "ElectronNativeAuth", memberName)),
    preloadTypesPath,
    `ElectronNativeAuth must declare ${memberName}`,
  );
}
const refreshTokenMember = getInterfaceMember(
  preloadTypes,
  "ElectronNativeAuthSessionResponse",
  "native_refresh_token",
);
assertContract(
  refreshTokenMember &&
    refreshTokenMember.type &&
    ts.isLiteralTypeNode(refreshTokenMember.type) &&
    ts.isStringLiteral(refreshTokenMember.type.literal) &&
    refreshTokenMember.type.literal.text === "",
  preloadTypesPath,
  "renderer native-auth responses must type native_refresh_token as an empty string",
);

const authProviderPath = "renderer/components/auth/AuthProvider.tsx";
const authProvider = parseSource(authProviderPath);
const authFunction = findFunction(authProvider, "Auth");
assertContract(
  authFunction &&
    Boolean(
      findDescendant(
        authFunction,
        (node) =>
          ts.isIdentifier(node) && node.text === "dismissedAuthPromptAddress",
      ),
    ) &&
    Boolean(
      findDescendant(
        authFunction,
        (node) => ts.isIdentifier(node) && node.text === "isDisconnecting",
      ),
    ) &&
    callsIdentifier(authFunction, "setDismissedAuthPromptAddress"),
  authProviderPath,
  "Auth must preserve explicit dismissal while disconnect settles",
);

const authModalPath = "renderer/components/auth/AuthSignModal.tsx";
const authModal = parseSource(authModalPath);
const authModalFunction = findFunction(authModal, "AuthSignModal");
const cancelAttribute = authModalFunction
  ? findDescendant(
      authModalFunction,
      (node) => ts.isJsxAttribute(node) && node.name.text === "onCancel",
    )
  : undefined;
assertContract(
  authModalFunction &&
    Boolean(
      findDescendant(
        authModalFunction,
        (node) => ts.isIdentifier(node) && node.text === "canDismissSignModal",
      ),
    ) &&
    cancelAttribute &&
    callsIdentifier(cancelAttribute, "onCancelSignRequest"),
  authModalPath,
  "AuthSignModal onCancel must invoke the guarded cancellation path",
);

if (failures.length > 0) {
  console.error("Desktop renderer contract failed:");
  for (const failure of failures) {
    console.error(`  ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Desktop renderer contract passed.");
}
