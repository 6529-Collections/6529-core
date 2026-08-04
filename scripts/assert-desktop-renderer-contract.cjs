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

function findVariable(sourceFile, variableName) {
  return findDescendant(
    sourceFile,
    (node) =>
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName,
  );
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

function hasBooleanObjectProperties(sourceFile, variableName, expected) {
  const declaration = findVariable(sourceFile, variableName);
  const initializer = declaration && unwrapExpression(declaration.initializer);
  if (!initializer || !ts.isObjectLiteralExpression(initializer)) {
    return false;
  }

  return Object.entries(expected).every(([propertyName, value]) =>
    initializer.properties.some((property) => {
      if (!ts.isPropertyAssignment(property)) {
        return false;
      }
      const name = property.name;
      const hasExpectedName =
        (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
        name.text === propertyName;
      return (
        hasExpectedName &&
        property.initializer.kind ===
          (value ? ts.SyntaxKind.TrueKeyword : ts.SyntaxKind.FalseKeyword)
      );
    }),
  );
}

function hasJsxElement(node, elementName) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (
        !ts.isJsxOpeningElement(candidate) &&
        !ts.isJsxSelfClosingElement(candidate)
      ) {
        return false;
      }
      return (
        ts.isIdentifier(candidate.tagName) &&
        candidate.tagName.text === elementName
      );
    }),
  );
}

function jsxElementSpreadsIdentifier(node, elementName, identifier) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (
        !ts.isJsxOpeningElement(candidate) &&
        !ts.isJsxSelfClosingElement(candidate)
      ) {
        return false;
      }
      if (
        !ts.isIdentifier(candidate.tagName) ||
        candidate.tagName.text !== elementName
      ) {
        return false;
      }
      return candidate.attributes.properties.some(
        (property) =>
          ts.isJsxSpreadAttribute(property) &&
          ts.isIdentifier(property.expression) &&
          property.expression.text === identifier,
      );
    }),
  );
}

function jsxAttributeUsesIdentifier(
  node,
  elementName,
  attributeName,
  identifier,
  negated = false,
) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (
        !ts.isJsxOpeningElement(candidate) &&
        !ts.isJsxSelfClosingElement(candidate)
      ) {
        return false;
      }
      if (
        !ts.isIdentifier(candidate.tagName) ||
        candidate.tagName.text !== elementName
      ) {
        return false;
      }
      const attribute = candidate.attributes.properties.find(
        (property) =>
          ts.isJsxAttribute(property) && property.name.text === attributeName,
      );
      if (
        !attribute ||
        !ts.isJsxAttribute(attribute) ||
        !attribute.initializer ||
        !ts.isJsxExpression(attribute.initializer) ||
        !attribute.initializer.expression
      ) {
        return false;
      }
      const expression = attribute.initializer.expression;
      if (negated) {
        return (
          ts.isPrefixUnaryExpression(expression) &&
          expression.operator === ts.SyntaxKind.ExclamationToken &&
          ts.isIdentifier(expression.operand) &&
          expression.operand.text === identifier
        );
      }
      return ts.isIdentifier(expression) && expression.text === identifier;
    }),
  );
}

function jsxElementIsGatedByIdentifier(node, elementName, identifier) {
  const element = findDescendant(
    node,
    (candidate) =>
      (ts.isJsxOpeningElement(candidate) ||
        ts.isJsxSelfClosingElement(candidate)) &&
      ts.isIdentifier(candidate.tagName) &&
      candidate.tagName.text === elementName,
  );
  if (!element) {
    return false;
  }

  for (
    let current = element.parent;
    current && current !== node;
    current = current.parent
  ) {
    if (
      ts.isConditionalExpression(current) &&
      ts.isIdentifier(current.condition) &&
      current.condition.text === identifier
    ) {
      return true;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      ts.isIdentifier(current.left) &&
      current.left.text === identifier
    ) {
      return true;
    }
  }
  return false;
}

function countGuardReturns(node, identifier) {
  let count = 0;
  const visit = (candidate) => {
    if (
      ts.isIfStatement(candidate) &&
      ts.isIdentifier(candidate.expression) &&
      candidate.expression.text === identifier &&
      findDescendant(candidate.thenStatement, (child) =>
        ts.isReturnStatement(child),
      )
    ) {
      count += 1;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return count;
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
const cancelSignRequest = findVariable(authProvider, "onCancelSignRequest");
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
assertContract(
  cancelSignRequest &&
    callsIdentifier(cancelSignRequest, "resetSigning") &&
    callsIdentifier(cancelSignRequest, "abortCurrentAuthOperation"),
  authProviderPath,
  "Auth cancellation must invalidate the active signature before disconnecting",
);

const authModalPath = "renderer/components/auth/AuthSignModal.tsx";
const authModal = parseSource(authModalPath);
const authModalFunction = findFunction(authModal, "AuthSignModal");
const canDismissSignModal = findVariable(authModal, "canDismissSignModal");
const backdropDismissAttribute = authModalFunction
  ? findDescendant(
      authModalFunction,
      (node) => ts.isJsxAttribute(node) && node.name.text === "onBackdropClick",
    )
  : undefined;
assertContract(
  authModalFunction &&
    hasJsxElement(authModalFunction, "ConfirmModalShell") &&
    !hasJsxElement(authModalFunction, "dialog") &&
    jsxAttributeUsesIdentifier(
      authModalFunction,
      "ConfirmModalShell",
      "overlayClassName",
      "AUTHENTICATION_MODAL_OVERLAY_CLASS",
    ) &&
    canDismissSignModal &&
    !findDescendant(
      canDismissSignModal.initializer,
      (node) =>
        ts.isIdentifier(node) && node.text === "isSignRequestInProgress",
    ) &&
    backdropDismissAttribute &&
    Boolean(
      findDescendant(
        backdropDismissAttribute,
        (node) => ts.isIdentifier(node) && node.text === "onCancelSignRequest",
      ),
    ),
  authModalPath,
  "AuthSignModal must remain below wallet prompts and stay cancellable while signing",
);

const confirmModalPath = "renderer/components/shared/ConfirmModalShell.tsx";
const confirmModal = parseSource(confirmModalPath);
const confirmModalFunction = findFunction(confirmModal, "ConfirmModalShell");
assertContract(
  confirmModalFunction &&
    Boolean(
      findDescendant(
        confirmModalFunction,
        (node) =>
          ts.isIdentifier(node) &&
          node.text === "WALLET_REQUEST_MODAL_OVERLAY_CLASS",
      ),
    ),
  confirmModalPath,
  "shared wallet prompts must retain the wallet-request modal layer",
);

const secureSignPath = "renderer/hooks/useSecureSign.ts";
const secureSign = parseSource(secureSignPath);
const secureSignFunction = findVariable(secureSign, "useSecureSign");
assertContract(
  secureSignFunction &&
    Boolean(
      findDescendant(
        secureSignFunction,
        (node) =>
          ts.isIdentifier(node) && node.text === "SigningOperationGuard",
      ),
    ) &&
    Boolean(
      findDescendant(
        secureSignFunction,
        (node) => ts.isIdentifier(node) && node.text === "invalidate",
      ),
    ) &&
    Boolean(
      findDescendant(
        secureSignFunction,
        (node) => ts.isIdentifier(node) && node.text === "isCurrent",
      ),
    ),
  secureSignPath,
  "secure signing must invalidate cancelled operations",
);

const connectProvider = parseSource(
  authProviderPath.replace("AuthProvider.tsx", "SeizeConnectProvider.tsx"),
);
const seizeDisconnect = findVariable(connectProvider, "seizeDisconnect");
assertContract(
  seizeDisconnect &&
    callsIdentifier(seizeDisconnect, "restoreStoredWalletState"),
  "renderer/components/auth/SeizeConnectProvider.tsx",
  "wallet cancellation must restore the last authenticated profile state",
);
const activeLocalWalletConnector = findVariable(
  connectProvider,
  "isActiveLocalWalletConnector",
);
const seizeAddConnectedAccount = findVariable(
  connectProvider,
  "seizeAddConnectedAccount",
);
const localConnectorDirectOpenGuard = seizeAddConnectedAccount
  ? findDescendant(
      seizeAddConnectedAccount,
      (node) =>
        ts.isIfStatement(node) &&
        Boolean(
          findDescendant(
            node.expression,
            (conditionNode) =>
              ts.isIdentifier(conditionNode) &&
              conditionNode.text === "isActiveLocalWalletConnector",
          ),
        ) &&
        callsIdentifier(node.thenStatement, "openAddConnectedAccountModal") &&
        !callsIdentifier(node.thenStatement, "disconnect"),
    )
  : undefined;
assertContract(
  activeLocalWalletConnector &&
    Boolean(
      findDescendant(
        activeLocalWalletConnector.initializer,
        (node) =>
          ts.isIdentifier(node) && node.text === "APP_WALLET_CONNECTOR_TYPE",
      ),
    ) &&
    Boolean(
      findDescendant(
        activeLocalWalletConnector.initializer,
        (node) =>
          ts.isIdentifier(node) && node.text === "SEED_WALLET_CONNECTOR_TYPE",
      ),
    ) &&
    Boolean(localConnectorDirectOpenGuard),
  "renderer/components/auth/SeizeConnectProvider.tsx",
  "Add profile must open directly for both app-wallet and Core seed-wallet connectors",
);

const seedConnectorPath = "renderer/wagmiConfig/seedWalletConnector.ts";
const seedConnector = parseSource(seedConnectorPath);
const seedConnectorFunction = findFunction(
  seedConnector,
  "seedWalletConnector",
);
assertContract(
  seedConnectorFunction &&
    callsIdentifier(seedConnectorFunction, "parseSeedWalletConnectionState") &&
    callsIdentifier(seedConnectorFunction, "rejectAllPendingRequests"),
  seedConnectorPath,
  "Core wallet connectors must stay address-bound and reject pending work on disconnect",
);

const routeFeaturesPath =
  "renderer/components/providers/app-route-provider-features.ts";
const routeFeatures = parseSource(routeFeaturesPath);
const browserConnectorFeatures = {
  enableVersionCheck: false,
  enableWalletAuthentication: false,
  enableCookieConsent: false,
  enableMyStream: false,
};
assertContract(
  hasBooleanObjectProperties(
    routeFeatures,
    "BROWSER_CONNECTOR_PROVIDER_FEATURES",
    browserConnectorFeatures,
  ),
  routeFeaturesPath,
  "browser connector must disable version, wallet-auth, cookie-consent, and My Stream global UI",
);

const appRouteProvidersPath =
  "renderer/components/providers/AppRouteProviders.tsx";
const appRouteProviders = parseSource(appRouteProvidersPath);
const appRouteProvidersFunction = findFunction(
  appRouteProviders,
  "AppRouteProviders",
);
assertContract(
  appRouteProvidersFunction &&
    callsIdentifier(appRouteProvidersFunction, "getAppRouteProviderFeatures") &&
    jsxElementSpreadsIdentifier(
      appRouteProvidersFunction,
      "Providers",
      "providerFeatures",
    ),
  appRouteProvidersPath,
  "AppRouteProviders must apply the route feature contract to Providers",
);

const providersPath = "renderer/components/providers/Providers.tsx";
const providers = parseSource(providersPath);
const providersFunction = findFunction(providers, "Providers");
assertContract(
  providersFunction &&
    jsxAttributeUsesIdentifier(
      providersFunction,
      "Auth",
      "enableWalletAuthentication",
      "enableWalletAuthentication",
    ) &&
    jsxAttributeUsesIdentifier(
      providersFunction,
      "CookieConsentProvider",
      "disabled",
      "enableCookieConsent",
      true,
    ) &&
    jsxElementIsGatedByIdentifier(
      providersFunction,
      "QuickDirectMessagesGate",
      "enableMyStream",
    ) &&
    jsxElementIsGatedByIdentifier(
      providersFunction,
      "NewVersionToast",
      "enableVersionCheck",
    ),
  providersPath,
  "Providers must keep every app-global UI surface behind its connector feature flag",
);

const rootLayoutPath = "renderer/app/layout.tsx";
const rootLayout = parseSource(rootLayoutPath);
const rootLayoutFunction = findFunction(rootLayout, "RootLayout");
assertContract(
  rootLayoutFunction && hasJsxElement(rootLayoutFunction, "AppRouteProviders"),
  rootLayoutPath,
  "RootLayout must route all pages through AppRouteProviders",
);

const awsRumPath = "renderer/components/monitoring/AwsRumProvider.tsx";
const awsRum = parseSource(awsRumPath);
const awsRumFunction = findFunction(awsRum, "AwsRumProvider");
assertContract(
  awsRumFunction &&
    callsIdentifier(awsRumFunction, "isBrowserConnectorRoute") &&
    countGuardReturns(awsRumFunction, "isBrowserConnector") >= 2,
  awsRumPath,
  "AWS RUM must remain disabled on the browser connector route",
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
