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

function countJsxElements(node, elementName) {
  let count = 0;
  const visit = (candidate) => {
    if (
      (ts.isJsxOpeningElement(candidate) ||
        ts.isJsxSelfClosingElement(candidate)) &&
      ts.isIdentifier(candidate.tagName) &&
      candidate.tagName.text === elementName
    ) {
      count += 1;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return count;
}

function isMemberExpression(node, objectName, memberName) {
  const expression = unwrapExpression(node);
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    return (
      expression.expression.text === objectName &&
      expression.name.text === memberName
    );
  }
  return Boolean(
    ts.isElementAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === objectName &&
      expression.argumentExpression &&
      ts.isStringLiteral(expression.argumentExpression) &&
      expression.argumentExpression.text === memberName,
  );
}

function findJsxElementByMemberAttribute(
  node,
  elementName,
  attributeName,
  objectName,
  memberName,
) {
  return findDescendant(node, (candidate) => {
    if (
      !ts.isJsxElement(candidate) ||
      !ts.isIdentifier(candidate.openingElement.tagName) ||
      candidate.openingElement.tagName.text !== elementName
    ) {
      return false;
    }
    const attribute = candidate.openingElement.attributes.properties.find(
      (property) =>
        ts.isJsxAttribute(property) && property.name.text === attributeName,
    );
    return Boolean(
      attribute &&
        ts.isJsxAttribute(attribute) &&
        attribute.initializer &&
        ts.isJsxExpression(attribute.initializer) &&
        attribute.initializer.expression &&
        isMemberExpression(
          attribute.initializer.expression,
          objectName,
          memberName,
        ),
    );
  });
}

function referencesMember(node, objectName, memberName) {
  return Boolean(
    findDescendant(node, (candidate) =>
      isMemberExpression(candidate, objectName, memberName),
    ),
  );
}

function hasJsxElementWithinMemberElement(
  node,
  objectName,
  memberName,
  childElementName,
) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (!ts.isJsxElement(candidate)) {
        return false;
      }
      const tagName = candidate.openingElement.tagName;
      return (
        ts.isPropertyAccessExpression(tagName) &&
        ts.isIdentifier(tagName.expression) &&
        tagName.expression.text === objectName &&
        tagName.name.text === memberName &&
        hasJsxElement(candidate, childElementName)
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

function jsxAttributeContainsIdentifier(
  node,
  elementName,
  attributeName,
  identifier,
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
      if (!attribute || !ts.isJsxAttribute(attribute)) {
        return false;
      }
      return Boolean(
        findDescendant(
          attribute,
          (descendant) =>
            ts.isIdentifier(descendant) && descendant.text === identifier,
        ),
      );
    }),
  );
}

function jsxAttributeHasStringValue(
  node,
  elementName,
  attributeName,
  expectedValue,
) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (
        (!ts.isJsxOpeningElement(candidate) &&
          !ts.isJsxSelfClosingElement(candidate)) ||
        !ts.isIdentifier(candidate.tagName) ||
        candidate.tagName.text !== elementName
      ) {
        return false;
      }
      const attribute = candidate.attributes.properties.find(
        (property) =>
          ts.isJsxAttribute(property) && property.name.text === attributeName,
      );
      return (
        attribute !== undefined &&
        ts.isJsxAttribute(attribute) &&
        attribute.initializer !== undefined &&
        ts.isStringLiteral(attribute.initializer) &&
        attribute.initializer.text === expectedValue
      );
    }),
  );
}

function allJsxElementsUseIdentifier(
  node,
  elementName,
  attributeName,
  identifier,
) {
  let elementCount = 0;
  let matchingElementCount = 0;

  function visit(candidate) {
    if (
      (ts.isJsxOpeningElement(candidate) ||
        ts.isJsxSelfClosingElement(candidate)) &&
      ts.isIdentifier(candidate.tagName) &&
      candidate.tagName.text === elementName
    ) {
      elementCount += 1;
      const attribute = candidate.attributes.properties.find(
        (property) =>
          ts.isJsxAttribute(property) && property.name.text === attributeName,
      );
      if (
        attribute &&
        ts.isJsxAttribute(attribute) &&
        attribute.initializer &&
        ts.isJsxExpression(attribute.initializer) &&
        attribute.initializer.expression &&
        ts.isIdentifier(attribute.initializer.expression) &&
        attribute.initializer.expression.text === identifier
      ) {
        matchingElementCount += 1;
      }
    }
    ts.forEachChild(candidate, visit);
  }

  visit(node);
  return elementCount > 0 && matchingElementCount === elementCount;
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

function countIdentifierCalls(node, identifier) {
  let count = 0;
  const visit = (candidate) => {
    if (
      ts.isCallExpression(candidate) &&
      ts.isIdentifier(candidate.expression) &&
      candidate.expression.text === identifier
    ) {
      count += 1;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return count;
}

function callObjectPropertyUsesIdentifier(
  node,
  functionName,
  propertyName,
  identifier,
) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (
        !ts.isCallExpression(candidate) ||
        !ts.isIdentifier(candidate.expression) ||
        candidate.expression.text !== functionName
      ) {
        return false;
      }
      const options = candidate.arguments[0];
      if (!options || !ts.isObjectLiteralExpression(options)) {
        return false;
      }
      return options.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name)) &&
          property.name.text === propertyName &&
          ts.isIdentifier(property.initializer) &&
          property.initializer.text === identifier,
      );
    }),
  );
}

function isPropertyCall(node, receiver, method) {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === receiver &&
    node.expression.name.text === method
  );
}

function hasBoundedShutdownSequence(node) {
  return Boolean(
    findDescendant(node, (candidate) => {
      if (!ts.isTryStatement(candidate) || !candidate.finallyBlock) {
        return false;
      }

      const awaitedAllSettled = findDescendant(
        candidate.tryBlock,
        (child) =>
          ts.isAwaitExpression(child) &&
          isPropertyCall(child.expression, "Promise", "allSettled"),
      );
      if (
        !awaitedAllSettled ||
        !ts.isAwaitExpression(awaitedAllSettled) ||
        !ts.isCallExpression(awaitedAllSettled.expression)
      ) {
        return false;
      }

      const operations = awaitedAllSettled.expression.arguments[0];
      if (!operations || !ts.isArrayLiteralExpression(operations)) {
        return false;
      }

      const timeoutWrappedOperations = operations.elements.filter(
        (element) =>
          ts.isCallExpression(element) &&
          ts.isIdentifier(element.expression) &&
          element.expression.text === "runShutdownStepWithTimeout" &&
          element.arguments[1] !== undefined,
      );
      const schedulerShutdown = timeoutWrappedOperations.find((operation) =>
        findDescendant(
          operation.arguments[1],
          (child) =>
            ts.isCallExpression(child) &&
            ts.isIdentifier(child.expression) &&
            child.expression.text === "stopSchedulers" &&
            child.arguments.length === 1 &&
            ts.isIdentifier(child.arguments[0]) &&
            child.arguments[0].text === "scheduledWorkers",
        ),
      );
      const ipfsShutdown = timeoutWrappedOperations.find((operation) =>
        findDescendant(operation.arguments[1], (child) =>
          isPropertyCall(child, "IPFS_SERVER", "shutdown"),
        ),
      );
      const quitsInFinally = Boolean(
        findDescendant(candidate.finallyBlock, (child) =>
          isPropertyCall(child, "app", "quit"),
        ),
      );

      return (
        schedulerShutdown !== undefined &&
        ipfsShutdown !== undefined &&
        schedulerShutdown !== ipfsShutdown &&
        quitsInFinally
      );
    }),
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

function importsModulePrefix(sourceFile, modulePrefix) {
  return Boolean(
    findDescendant(
      sourceFile,
      (candidate) =>
        ts.isImportDeclaration(candidate) &&
        ts.isStringLiteral(candidate.moduleSpecifier) &&
        candidate.moduleSpecifier.text.startsWith(modulePrefix),
    ),
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

const packageJsonPath = "package.json";
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, packageJsonPath), "utf8"),
);
const electronBuildTsconfigPath = "electron-src/tsconfig.build.json";
const electronBuildTsconfig = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, electronBuildTsconfigPath), "utf8"),
);
const electronBuildExcludes = electronBuildTsconfig.exclude ?? [];
assertContract(
  packageJson.scripts?.["build-electron"]?.includes(
    "tsc -p electron-src/tsconfig.build.json",
  ) &&
    packageJson.scripts?.["build-electron-win"]?.includes(
      "tsc -p electron-src/tsconfig.build.json",
    ),
  packageJsonPath,
  "Electron production builds must use the test-excluding build tsconfig",
);
assertContract(
  electronBuildTsconfig.compilerOptions?.rootDir === ".." &&
    electronBuildExcludes.includes("**/*.test.ts") &&
    electronBuildExcludes.includes("**/*.test.tsx"),
  electronBuildTsconfigPath,
  "Electron production compilation must preserve output paths and exclude tests",
);

const headerQrModalPath =
  "renderer/components/header/share/header-share/HeaderQRModal.tsx";
const headerQrModal = parseSource(headerQrModalPath);
const headerQrModalFunction = findFunction(headerQrModal, "HeaderQRModal");
const electronPublicShareUrl = headerQrModalFunction
  ? findDescendant(
      headerQrModalFunction,
      (node) =>
        ts.isConditionalExpression(node) &&
        ts.isIdentifier(node.condition) &&
        node.condition.text === "isElectron" &&
        callsIdentifier(node.whenTrue, "getCurrentPublicUrl"),
    )
  : undefined;
assertContract(
  Boolean(electronPublicShareUrl),
  headerQrModalPath,
  "Electron page-share QR, copy, and social actions must use the public URL",
);

const headerShareModalViewPath =
  "renderer/components/header/share/header-share/HeaderShareModalView.tsx";
const headerShareModalView = parseSource(headerShareModalViewPath);
const headerShareModalViewFunction = findFunction(
  headerShareModalView,
  "HeaderShareModalView",
);
assertContract(
  headerShareModalViewFunction &&
    callObjectPropertyUsesIdentifier(
      headerShareModalViewFunction,
      "useSystemShare",
      "usePublicUrl",
      "isElectron",
    ),
  headerShareModalViewPath,
  "Electron system sharing must use BASE_ENDPOINT instead of localhost",
);
const openActionUrl = findVariable(headerShareModalView, "openActionUrl");
const openActionUrlInitializer =
  openActionUrl && unwrapExpression(openActionUrl.initializer);
assertContract(
  headerShareModalViewFunction &&
    openActionUrlInitializer &&
    ts.isConditionalExpression(openActionUrlInitializer) &&
    ts.isIdentifier(openActionUrlInitializer.condition) &&
    openActionUrlInitializer.condition.text === "isElectron" &&
    ts.isIdentifier(openActionUrlInitializer.whenTrue) &&
    openActionUrlInitializer.whenTrue.text === "url" &&
    jsxAttributeUsesIdentifier(
      headerShareModalViewFunction,
      "a",
      "href",
      "openActionUrl",
    ) &&
    jsxAttributeContainsIdentifier(
      headerShareModalViewFunction,
      "a",
      "target",
      "isElectron",
    ) &&
    callsIdentifier(headerShareModalViewFunction, "openInExternalBrowser") &&
    hasJsxElement(headerShareModalViewFunction, "GlobeAltIcon") &&
    Boolean(
      findDescendant(
        headerShareModalViewFunction,
        (node) =>
          ts.isStringLiteral(node) &&
          node.text === "headerShare.social.web",
      ),
    ),
  headerShareModalViewPath,
  "Electron page sharing must show a globe action that opens the public 6529.io page in the system browser",
);

const pageShareSupportPath =
  "renderer/components/header/share/page-share-support.ts";
const pageShareSupport = parseSource(pageShareSupportPath);
const allPageShareUnsupportedPaths = findVariable(
  pageShareSupport,
  "ALL_PAGE_SHARE_UNSUPPORTED_PATHS",
);
const allPageShareUnsupportedPathsInitializer =
  allPageShareUnsupportedPaths &&
  unwrapExpression(allPageShareUnsupportedPaths.initializer);
assertContract(
  allPageShareUnsupportedPathsInitializer &&
    ts.isArrayLiteralExpression(allPageShareUnsupportedPathsInitializer) &&
    [
      "PAGE_SHARE_UNSUPPORTED_PATHS",
      "CORE_PAGE_SHARE_UNSUPPORTED_PATHS",
    ].every((identifier) =>
      allPageShareUnsupportedPathsInitializer.elements.some(
        (element) =>
          ts.isSpreadElement(element) &&
          ts.isIdentifier(element.expression) &&
          element.expression.text === identifier,
      ),
    ),
  pageShareSupportPath,
  "Page-share support must combine frontend and Core-only exclusions",
);

const corePageShareSupportPath =
  "renderer/components/header/share/core-page-share-support.ts";
const corePageShareSupport = parseSource(corePageShareSupportPath);
assertContract(
  Boolean(
    findDescendant(
      corePageShareSupport,
      (node) => ts.isStringLiteral(node) && node.text === "/core",
    ),
  ),
  corePageShareSupportPath,
  "Core-only routes must remain excluded from public page sharing",
);

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

const sessionPersistencePath =
  "renderer/services/auth/session-persistence.utils.ts";
const sessionPersistence = parseSource(sessionPersistencePath);
const persistNativeRefreshTokenIfNeeded = findVariable(
  sessionPersistence,
  "persistNativeRefreshTokenIfNeeded",
);
const electronPersistenceGuard = persistNativeRefreshTokenIfNeeded
  ? findDescendant(
      persistNativeRefreshTokenIfNeeded,
      (node) =>
        ts.isIfStatement(node) &&
        callsIdentifier(node.expression, "isElectron") &&
        Boolean(
          findDescendant(
            node.expression,
            (conditionNode) =>
              ts.isStringLiteral(conditionNode) &&
              conditionNode.text === "desktop",
          ),
        ) &&
        returnsStringLiteral(node.thenStatement, "persisted") &&
        !callsIdentifier(node.thenStatement, "setNativeRefreshToken"),
    )
  : undefined;
assertContract(
  Boolean(electronPersistenceGuard),
  sessionPersistencePath,
  "Electron session persistence must leave refresh tokens in the main process",
);

const authRequestSignInPath =
  "renderer/components/auth/authRequestSignIn.ts";
const authRequestSignIn = parseSource(authRequestSignInPath);
const createSignInSession = findVariable(
  authRequestSignIn,
  "createSignInSession",
);
assertContract(
  createSignInSession &&
    Boolean(
      findDescendant(
        createSignInSession,
        (node) =>
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "clientSignature" &&
          node.name.text === "cancelled",
      ),
    ),
  authRequestSignInPath,
  "auth request sign-in must preserve explicit cancellation results",
);

const authActionsPath = "renderer/components/auth/authActions.ts";
const authActions = parseSource(authActionsPath);
const requestSessionUpgrade = findVariable(
  authActions,
  "requestSessionUpgrade",
);
assertContract(
  requestSessionUpgrade &&
    Boolean(
      findDescendant(
        requestSessionUpgrade,
        (node) => ts.isIdentifier(node) && node.text === "cancelled",
      ),
    ) &&
    callsIdentifier(requestSessionUpgrade, "setShowSignModal"),
  authActionsPath,
  "session-upgrade cancellation must dismiss without failure handling",
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
const quitApplication = findFunction(mainSource, "quitApplication");
assertContract(
  quitApplication && hasBoundedShutdownSequence(quitApplication),
  mainPath,
  "app shutdown must await timeout-wrapped scheduler and IPFS cleanup before quitting",
);
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
const activeWalletStorageWritebackGuard = authFunction
  ? findDescendant(
      authFunction,
      (node) =>
        ts.isIfStatement(node) &&
        callsIdentifier(node.thenStatement, "setActiveWalletAccount") &&
        callsIdentifier(node.expression, "isElectron") &&
        Boolean(
          findDescendant(
            node.expression,
            (conditionNode) =>
              ts.isPrefixUnaryExpression(conditionNode) &&
              conditionNode.operator === ts.SyntaxKind.ExclamationToken &&
              callsIdentifier(conditionNode.operand, "isElectron"),
          ),
        ),
    )
  : undefined;
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
assertContract(
  Boolean(activeWalletStorageWritebackGuard),
  authProviderPath,
  "passive auth validation must never change the active wallet account in Electron",
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

const seedWalletRequestPath =
  "renderer/components/confirm/ConfirmSeedWalletRequest.tsx";
const seedWalletRequest = parseSource(seedWalletRequestPath);
const seedWalletRequestFunction = findFunction(
  seedWalletRequest,
  "ConfirmSeedWalletRequest",
);
assertContract(
  seedWalletRequestFunction &&
    jsxAttributeContainsIdentifier(
      seedWalletRequestFunction,
      "ConfirmModalShell",
      "dialogClassName",
      "SEED_WALLET_REQUEST_DIALOG_CLASS",
    ) &&
    jsxAttributeContainsIdentifier(
      seedWalletRequestFunction,
      "ConfirmModalShell",
      "bodyClassName",
      "SEED_WALLET_REQUEST_BODY_CLASS",
    ) &&
    jsxAttributeContainsIdentifier(
      seedWalletRequestFunction,
      "ConfirmModalShell",
      "headerClassName",
      "SEED_WALLET_REQUEST_FIXED_SECTION_CLASS",
    ) &&
    jsxAttributeContainsIdentifier(
      seedWalletRequestFunction,
      "ConfirmModalShell",
      "footerClassName",
      "SEED_WALLET_REQUEST_FIXED_SECTION_CLASS",
    ),
  seedWalletRequestPath,
  "Core wallet requests must retain the shared responsive shell with a scrolling body and fixed actions",
);

const coreWalletModalLayoutPath =
  "renderer/components/shared/core-wallet-modal-layout.ts";
const coreWalletModalLayout = parseSource(coreWalletModalLayoutPath);
const coreWalletModalSizeClass = findVariable(
  coreWalletModalLayout,
  "CORE_WALLET_MODAL_SIZE_CLASS",
);
const coreWalletModalSizeInitializer =
  coreWalletModalSizeClass &&
  unwrapExpression(coreWalletModalSizeClass.initializer);
const connectorModalLayoutPath =
  "renderer/components/header/user/connector-modal-layout.ts";
const connectorModalLayout = parseSource(connectorModalLayoutPath);
const connectorModalDialogClass = findVariable(
  connectorModalLayout,
  "CONNECTOR_MODAL_DIALOG_CLASS",
);
const seedWalletRequestLayoutPath =
  "renderer/components/confirm/seed-wallet-request-layout.ts";
const seedWalletRequestLayout = parseSource(seedWalletRequestLayoutPath);
const seedWalletRequestDialogClass = findVariable(
  seedWalletRequestLayout,
  "SEED_WALLET_REQUEST_DIALOG_CLASS",
);
assertContract(
  coreWalletModalSizeInitializer &&
    ts.isStringLiteral(coreWalletModalSizeInitializer) &&
    coreWalletModalSizeInitializer.text.includes("!tw-w-[calc(100vw-2rem)]") &&
    coreWalletModalSizeInitializer.text.includes("!tw-max-w-[40rem]") &&
    coreWalletModalSizeInitializer.text.includes(
      "!tw-max-h-[min(78dvh,40rem)]",
    ) &&
    connectorModalDialogClass &&
    Boolean(
      findDescendant(
        connectorModalDialogClass.initializer,
        (node) =>
          ts.isIdentifier(node) && node.text === "CORE_WALLET_MODAL_SIZE_CLASS",
      ),
    ) &&
    seedWalletRequestDialogClass &&
    Boolean(
      findDescendant(
        seedWalletRequestDialogClass.initializer,
        (node) =>
          ts.isIdentifier(node) && node.text === "CORE_WALLET_MODAL_SIZE_CLASS",
      ),
    ),
  coreWalletModalLayoutPath,
  "Core wallet chooser and request prompt must share the responsive 40rem size envelope",
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
const connectProviderPath =
  "renderer/components/auth/SeizeConnectProvider.tsx";
const seizeDisconnect = findVariable(connectProvider, "seizeDisconnect");
assertContract(
  seizeDisconnect &&
    callsIdentifier(seizeDisconnect, "restoreStoredWalletState"),
  connectProviderPath,
  "wallet cancellation must restore the last authenticated profile state",
);
const signOutAllResetEffect = findDescendant(
  connectProvider,
  (node) =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "useEffect" &&
    Boolean(
      findDescendant(
        node,
        (child) => ts.isIdentifier(child) && child.text === "isSigningOutAll",
      ),
    ) &&
    callsIdentifier(node, "clearBrowserConnectorConnectIntent") &&
    callsIdentifier(node, "setShowConnectModal"),
);
const authSignOutGuard = authFunction
  ? findDescendant(
      authFunction,
      (node) =>
        ts.isIfStatement(node) &&
        Boolean(
          findDescendant(
            node.expression,
            (child) =>
              ts.isIdentifier(child) && child.text === "isSigningOutAll",
          ),
        ) &&
        callsIdentifier(node.thenStatement, "setShowSignModal"),
    )
  : undefined;
const shouldShowSignModal = findVariable(authProvider, "shouldShowSignModal");
assertContract(
  Boolean(signOutAllResetEffect) &&
    countIdentifierCalls(
      connectProvider,
      "hasSignOutAllGenerationChanged",
    ) >= 4 &&
    callsIdentifier(connectProvider, "getSignOutAllGeneration"),
  connectProviderPath,
  "atomic sign-out must close desktop connector state and fence delayed connect/add continuations",
);
assertContract(
  Boolean(authSignOutGuard) &&
    shouldShowSignModal &&
    Boolean(
      findDescendant(
        shouldShowSignModal.initializer,
        (node) => ts.isIdentifier(node) && node.text === "isSigningOutAll",
      ),
    ),
  authProviderPath,
  "Auth must suppress wallet-auth prompts throughout atomic sign-out",
);
const activeLocalWalletConnector = findVariable(
  connectProvider,
  "isActiveLocalWalletConnector",
);
const matchingSeedWalletConnector = findVariable(
  connectProvider,
  "hasMatchingSeedWalletConnector",
);
const selectedLiveWalletAccount = findVariable(connectProvider, "liveAccount");
const openConnectModal = findVariable(connectProvider, "openConnectModal");
const electronChooserDirectOpenGuard = openConnectModal
  ? findDescendant(
      openConnectModal,
      (node) =>
        ts.isIfStatement(node) &&
        callsIdentifier(node.expression, "isElectron") &&
        callsIdentifier(node.thenStatement, "setShowConnectModal") &&
        !callsIdentifier(node.thenStatement, "waitForAppKitReady") &&
        Boolean(
          findDescendant(node.thenStatement, (child) =>
            ts.isReturnStatement(child),
          ),
        ),
    )
  : undefined;
const appKitReadinessWait = openConnectModal
  ? findDescendant(
      openConnectModal,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "waitForAppKitReady",
    )
  : undefined;
const seizeAddConnectedAccount = findVariable(
  connectProvider,
  "seizeAddConnectedAccount",
);
const electronAddDirectOpenGuard = seizeAddConnectedAccount
  ? findDescendant(
      seizeAddConnectedAccount,
      (node) =>
        ts.isIfStatement(node) &&
        callsIdentifier(node.expression, "isElectron") &&
        callsIdentifier(node.thenStatement, "openDesktopAddConnectorChooser") &&
        callsIdentifier(node.thenStatement, "openAddConnectedAccountModal") &&
        callsIdentifier(node.thenStatement, "getWalletAddress") &&
        !callsIdentifier(node.thenStatement, "disconnect") &&
        !callsIdentifier(node.thenStatement, "setActiveWalletAccount") &&
        !callsIdentifier(node.thenStatement, "setConnected") &&
        Boolean(
          findDescendant(node.thenStatement, (child) =>
            ts.isReturnStatement(child),
          ),
        ),
    )
  : undefined;
const electronAddRefArmed = electronAddDirectOpenGuard
  ? findDescendant(
      electronAddDirectOpenGuard.thenStatement,
      (node) =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isMemberExpression(
          node.left,
          "isAddingConnectedAccountRef",
          "current",
        ) &&
        node.right.kind === ts.SyntaxKind.TrueKeyword,
    )
  : undefined;
const electronAddOriginMutation = electronAddDirectOpenGuard
  ? findDescendant(
      electronAddDirectOpenGuard.thenStatement,
      (node) =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isMemberExpression(node.left, "addFlowOriginAddressRef", "current"),
    )
  : undefined;
const connectorLifecyclePath =
  "renderer/components/auth/connector-selection-lifecycle.ts";
const connectorLifecycle = parseSource(connectorLifecyclePath);
const openDesktopAddConnectorChooser = findFunction(
  connectorLifecycle,
  "openDesktopAddConnectorChooser",
);
const desktopAddCandidateCleared = openDesktopAddConnectorChooser
  ? findDescendant(
      openDesktopAddConnectorChooser,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "clearAddCandidate",
    )
  : undefined;
const desktopAddStateReset = openDesktopAddConnectorChooser
  ? findDescendant(
      openDesktopAddConnectorChooser,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "setAddingConnectedAccount" &&
        node.arguments.length === 1 &&
        node.arguments[0].kind === ts.SyntaxKind.FalseKeyword,
    )
  : undefined;
const desktopAddChooserOpened = openDesktopAddConnectorChooser
  ? findDescendant(
      openDesktopAddConnectorChooser,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "openChooser",
    )
  : undefined;
const browserConnectorHandoffRef = findVariable(
  connectProvider,
  "isBrowserConnectorHandoffRef",
);
const beginBrowserConnectorHandoff = findVariable(
  connectProvider,
  "seizeBeginBrowserConnectorHandoff",
);
const endBrowserConnectorHandoff = findVariable(
  connectProvider,
  "seizeEndBrowserConnectorHandoff",
);
const beginBrowserHandoffStateGuard = beginBrowserConnectorHandoff
  ? findDescendant(
      beginBrowserConnectorHandoff,
      (node) =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isMemberExpression(
          node.left,
          "isBrowserConnectorHandoffRef",
          "current",
        ) &&
        node.right.kind === ts.SyntaxKind.TrueKeyword,
    )
  : undefined;
const beginBrowserHandoffCancelsAdd = beginBrowserConnectorHandoff
  ? callsIdentifier(
      beginBrowserConnectorHandoff,
      "setIsAddingConnectedAccount",
    ) &&
    Boolean(
      findDescendant(
        beginBrowserConnectorHandoff,
        (node) =>
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          isMemberExpression(
            node.left,
            "isAddingConnectedAccountRef",
            "current",
          ) &&
          node.right.kind === ts.SyntaxKind.FalseKeyword,
      ),
    )
  : false;
const endBrowserHandoffStateGuard = endBrowserConnectorHandoff
  ? findDescendant(
      endBrowserConnectorHandoff,
      (node) =>
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isMemberExpression(
          node.left,
          "isBrowserConnectorHandoffRef",
          "current",
        ) &&
        node.right.kind === ts.SyntaxKind.FalseKeyword,
    )
  : undefined;
const providerEffectsCall = findDescendant(
  connectProvider,
  (node) =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "useSeizeConnectProviderEffects",
);
const providerEffectsReceivesBrowserHandoffRef = providerEffectsCall
  ? Boolean(
      findDescendant(
        providerEffectsCall,
        (node) =>
          ts.isIdentifier(node) && node.text === "isBrowserConnectorHandoffRef",
      ),
    )
  : false;
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
    matchingSeedWalletConnector &&
    Boolean(
      findDescendant(
        matchingSeedWalletConnector.initializer,
        (node) => ts.isIdentifier(node) && node.text === "wagmiConnectors",
      ),
    ) &&
    Boolean(
      findDescendant(
        matchingSeedWalletConnector.initializer,
        (node) =>
          ts.isIdentifier(node) && node.text === "connectorIdentityAddress",
      ),
    ) &&
    Boolean(localConnectorDirectOpenGuard),
  "renderer/components/auth/SeizeConnectProvider.tsx",
  "Add profile must open directly for both app-wallet and Core seed-wallet connectors",
);
assertContract(
  selectedLiveWalletAccount &&
    callsIdentifier(
      selectedLiveWalletAccount.initializer,
      "selectLiveWalletAccount",
    ),
  "renderer/components/auth/SeizeConnectProvider.tsx",
  "live wallet selection must preserve the explicitly active browser connector over stale Wagmi state",
);
assertContract(
  electronAddDirectOpenGuard &&
    !electronAddRefArmed &&
    !electronAddOriginMutation &&
    desktopAddCandidateCleared &&
    desktopAddStateReset &&
    desktopAddChooserOpened &&
    desktopAddCandidateCleared.getStart() < desktopAddStateReset.getStart() &&
    desktopAddStateReset.getStart() < desktopAddChooserOpened.getStart(),
  connectorLifecyclePath,
  "Electron Add must keep candidate reconciliation disabled, open the chooser, and not disconnect or activate a wallet",
);
assertContract(
  browserConnectorHandoffRef &&
    beginBrowserHandoffStateGuard &&
    beginBrowserHandoffCancelsAdd &&
    endBrowserHandoffStateGuard &&
    endBrowserConnectorHandoff &&
    callsIdentifier(endBrowserConnectorHandoff, "restoreStoredWalletState") &&
    providerEffectsReceivesBrowserHandoffRef,
  "renderer/components/auth/SeizeConnectProvider.tsx",
  "Browser reconnect handoff must suppress generic Add reconciliation and restore the explicitly selected profile",
);
assertContract(
  electronChooserDirectOpenGuard &&
    appKitReadinessWait &&
    electronChooserDirectOpenGuard.getStart() < appKitReadinessWait.getStart(),
  "renderer/components/auth/SeizeConnectProvider.tsx",
  "Electron connector chooser must open before and independently of AppKit readiness",
);

const connectorModalPath =
  "renderer/components/header/user/HeaderUserConnectModal.tsx";
const connectorModal = parseSource(connectorModalPath);
const connectorModalFunction = findFunction(
  connectorModal,
  "HeaderUserConnectModal",
);
const connectorSelectorFunction = findFunction(
  connectorModal,
  "ConnectorSelector",
);
const connectorOnConnect = connectorSelectorFunction
  ? findVariable(connectorSelectorFunction, "onConnect")
  : undefined;
const isSelectionGuardCall = (node, methodName) =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  node.expression.name.text === methodName &&
  ts.isPropertyAccessExpression(node.expression.expression) &&
  ts.isIdentifier(node.expression.expression.expression) &&
  node.expression.expression.expression.text === "props" &&
  node.expression.expression.name.text === "selectionGuard";
const selectionGuardAcquire = connectorOnConnect
  ? findDescendant(connectorOnConnect, (node) =>
      isSelectionGuardCall(node, "tryAcquire"),
    )
  : undefined;
const selectionGuardRelease = connectorOnConnect
  ? findDescendant(
      connectorOnConnect,
      (node) =>
        ts.isTryStatement(node) &&
        node.finallyBlock &&
        Boolean(
          findDescendant(node.finallyBlock, (child) =>
            isSelectionGuardCall(child, "release"),
          ),
        ),
    )
  : undefined;
const browserConnectorSelectionGuard = connectorOnConnect
  ? findDescendant(
      connectorOnConnect,
      (node) =>
        ts.isIfStatement(node) &&
        Boolean(
          findDescendant(
            node.expression,
            (child) => ts.isStringLiteral(child) && child.text === "browser",
          ),
        ) &&
        callsIdentifier(
          node.thenStatement,
          "startFreshBrowserConnectorSelection",
        ) &&
        callsIdentifier(node.thenStatement, "disconnectAsync") &&
        callsIdentifier(node.thenStatement, "connectAsync") &&
        callsIdentifier(
          node.thenStatement,
          "seizeBeginBrowserConnectorHandoff",
        ) &&
        callsIdentifier(
          node.thenStatement,
          "seizeEndBrowserConnectorHandoff",
        ) &&
        Boolean(
          findDescendant(
            node.thenStatement,
            (child) =>
              ts.isCallExpression(child) &&
              ts.isPropertyAccessExpression(child.expression) &&
              child.expression.name.text === "disconnect" &&
              ts.isPropertyAccessExpression(child.expression.expression) &&
              ts.isIdentifier(child.expression.expression.expression) &&
              child.expression.expression.expression.text === "props" &&
              child.expression.expression.name.text === "connector",
          ),
        ),
    )
  : undefined;
const connectorSelectionPath =
  "renderer/components/header/user/complete-connector-selection.ts";
const connectorSelection = parseSource(connectorSelectionPath);
const completeConnectorSelectionFunction = findFunction(
  connectorSelection,
  "completeConnectorSelection",
);
const startFreshBrowserConnectorSelectionFunction = findFunction(
  connectorSelection,
  "startFreshBrowserConnectorSelection",
);
const awaitedConnect = completeConnectorSelectionFunction
  ? findDescendant(
      completeConnectorSelectionFunction,
      (node) =>
        ts.isAwaitExpression(node) &&
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "connect",
    )
  : undefined;
const acceptedConnection = completeConnectorSelectionFunction
  ? findDescendant(
      completeConnectorSelectionFunction,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "acceptConnection",
    )
  : undefined;
const completedSelection = completeConnectorSelectionFunction
  ? findDescendant(
      completeConnectorSelectionFunction,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "select",
    )
  : undefined;
const browserSelectionClosed = startFreshBrowserConnectorSelectionFunction
  ? findDescendant(
      startFreshBrowserConnectorSelectionFunction,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "select",
    )
  : undefined;
const browserHandoffBegan = startFreshBrowserConnectorSelectionFunction
  ? findDescendant(
      startFreshBrowserConnectorSelectionFunction,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "beginHandoff",
    )
  : undefined;
const browserConnectorReset = startFreshBrowserConnectorSelectionFunction
  ? findDescendant(
      startFreshBrowserConnectorSelectionFunction,
      (node) =>
        ts.isAwaitExpression(node) &&
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "reset",
    )
  : undefined;
const browserConnectorConnected = startFreshBrowserConnectorSelectionFunction
  ? findDescendant(
      startFreshBrowserConnectorSelectionFunction,
      (node) =>
        ts.isAwaitExpression(node) &&
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "connect",
    )
  : undefined;
const browserHandoffEnded = startFreshBrowserConnectorSelectionFunction
  ? findDescendant(
      startFreshBrowserConnectorSelectionFunction,
      (node) =>
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "endHandoff" &&
        ts.isExpressionStatement(node.parent) &&
        ts.isBlock(node.parent.parent) &&
        ts.isTryStatement(node.parent.parent.parent) &&
        node.parent.parent.parent.finallyBlock === node.parent.parent,
    )
  : undefined;
assertContract(
  importsModulePrefix(
    connectorModal,
    "@/components/auth/seizeConnectContextValue",
  ) &&
    connectorModalFunction &&
    jsxAttributeUsesIdentifier(
      connectorModalFunction,
      "div",
      "className",
      "CONNECTOR_MODAL_DIALOG_CLASS",
    ) &&
    jsxAttributeContainsIdentifier(
      connectorModalFunction,
      "div",
      "className",
      "CONNECTOR_MODAL_BODY_CLASS",
    ) &&
    connectorSelectorFunction &&
    callsIdentifier(connectorSelectorFunction, "getSeedWalletSelectionState") &&
    callsIdentifier(connectorSelectorFunction, "seizeSwitchConnectedAccount") &&
    callsIdentifier(connectorSelectorFunction, "completeConnectorSelection") &&
    Boolean(selectionGuardAcquire) &&
    Boolean(selectionGuardRelease) &&
    jsxAttributeUsesIdentifier(
      connectorSelectorFunction,
      "button",
      "disabled",
      "isActive",
    ),
  connectorModalPath,
  "Core wallet chooser must serialize selections, complete new connections before closing, stay wide, disable the active wallet, and switch authenticated wallets without reconnecting",
);
assertContract(
  awaitedConnect &&
    acceptedConnection &&
    completedSelection &&
    awaitedConnect.getStart() < acceptedConnection.getStart() &&
    acceptedConnection.getStart() < completedSelection.getStart(),
  connectorSelectionPath,
  "Core wallet selection must connect, make the selected address authoritative, and only then close the chooser",
);
assertContract(
  browserConnectorSelectionGuard &&
    browserHandoffBegan &&
    browserSelectionClosed &&
    browserConnectorReset &&
    browserConnectorConnected &&
    browserHandoffEnded &&
    browserHandoffBegan.getStart() < browserSelectionClosed.getStart() &&
    browserSelectionClosed.getStart() < browserConnectorReset.getStart() &&
    browserConnectorReset.getStart() < browserConnectorConnected.getStart() &&
    browserConnectorConnected.getStart() < browserHandoffEnded.getStart(),
  connectorSelectionPath,
  "Browser selection must protect the active profile, close immediately, reset and reconnect, then always end the handoff",
);

const connectEffectsPath = "renderer/components/auth/seizeConnectEffects.ts";
const connectEffects = parseSource(connectEffectsPath);
const useConnectEffectsFunction = findFunction(
  connectEffects,
  "useSeizeConnectProviderEffects",
);
const connectorReconciliationEffectGuard = useConnectEffectsFunction
  ? findDescendant(
      useConnectEffectsFunction,
      (node) =>
        ts.isIfStatement(node) &&
        callsIdentifier(node.expression, "shouldReconcileConnectorState") &&
        referencesMember(
          node.expression,
          "isBrowserConnectorHandoffRef",
          "current",
        ) &&
        Boolean(
          findDescendant(
            node.expression,
            (child) => ts.isIdentifier(child) && child.text === "stateOpen",
          ),
        ) &&
        Boolean(
          findDescendant(node.thenStatement, (child) =>
            ts.isReturnStatement(child),
          ),
        ),
    )
  : undefined;
assertContract(
  Boolean(connectorReconciliationEffectGuard),
  connectEffectsPath,
  "Wallet reconciliation must ignore existing connectors while the chooser is open or Browser reconnect handoff is active",
);

const browserConnectorConnectPath =
  "renderer/components/browser-connector/BrowserConnectorConnect.tsx";
const browserConnectorConnect = parseSource(browserConnectorConnectPath);
const browserConnectorConnectFunction = findFunction(
  browserConnectorConnect,
  "BrowserConnectorConnect",
);
const browserConnectorAuthFooter = browserConnectorConnectFunction
  ? findJsxElementByMemberAttribute(
      browserConnectorConnectFunction,
      "div",
      "className",
      "authModalStyles",
      "signModalFooter",
    )
  : undefined;
assertContract(
  browserConnectorConnectFunction &&
    browserConnectorAuthFooter &&
    countJsxElements(browserConnectorAuthFooter, "Button") === 2 &&
    !["signModalCancelButton", "signModalConfirmButton"].some((memberName) =>
      referencesMember(
        browserConnectorConnectFunction,
        "authModalStyles",
        memberName,
      ),
    ),
  browserConnectorConnectPath,
  "browser-connector authentication footer must contain both shared styled buttons and must not use removed CSS-module classes",
);

const seizeConnectModalContextPath =
  "renderer/contexts/SeizeConnectModalContext.tsx";
const seizeConnectModalContext = parseSource(seizeConnectModalContextPath);
const seizeConnectModal = findVariable(
  seizeConnectModalContext,
  "SeizeConnectModal",
);
const seizeConnectModalProvider = findVariable(
  seizeConnectModalContext,
  "SeizeConnectModalProvider",
);
assertContract(
  seizeConnectModal &&
    hasJsxElement(seizeConnectModal, "HeaderUserConnectModal") &&
    seizeConnectModalProvider &&
    !hasJsxElement(seizeConnectModalProvider, "HeaderUserConnectModal") &&
    hasJsxElementWithinMemberElement(
      connectProvider,
      "SeizeConnectContext",
      "Provider",
      "SeizeConnectModal",
    ),
  seizeConnectModalContextPath,
  "connector chooser must render inside SeizeConnectContext so Core wallet rows can consume connection state",
);

const errorComponentPath = "renderer/components/error/Error.tsx";
const errorComponent = parseSource(errorComponentPath);
const errorComponentFunction = findFunction(errorComponent, "ErrorComponent");
assertContract(
  errorComponentFunction &&
    !importsModulePrefix(errorComponent, "@/contexts/TitleContext") &&
    !callsIdentifier(errorComponentFunction, "useTitle"),
  errorComponentPath,
  "route error fallback must render without TitleProvider",
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
    callsIdentifier(seedConnectorFunction, "rejectAllPendingRequests") &&
    callsIdentifier(seedConnectorFunction, "requireSupportedSeedWalletChainId"),
  seedConnectorPath,
  "Core wallet connectors must stay address-bound, chain-bound, and reject pending work on disconnect",
);
const seedConnectionStatePath =
  "renderer/wagmiConfig/seedWalletConnectionState.ts";
const seedConnectionState = parseSource(seedConnectionStatePath);
assertContract(
  !importsModulePrefix(seedConnectionState, "viem") &&
    !importsModulePrefix(seedConnectionState, "ox"),
  seedConnectionStatePath,
  "Electron-tested Core wallet state must remain dependency-light and must not import viem or ox source",
);

const rpcProviderModalPath =
  "renderer/components/core/eth-scanner/RpcProviderModal.tsx";
const rpcProviderModal = parseSource(rpcProviderModalPath);
const addRpcProviderModal = findFunction(
  rpcProviderModal,
  "AddRpcProviderModal",
);
assertContract(
  addRpcProviderModal &&
    allJsxElementsUseIdentifier(
      addRpcProviderModal,
      "ConfirmModalShell",
      "overlayClassName",
      "NON_WALLET_MODAL_OVERLAY_CLASS",
    ),
  rpcProviderModalPath,
  "RPC provider dialogs must remain below authentication and wallet prompts",
);

const workersPath = "renderer/components/core/eth-scanner/Workers.tsx";
const workers = parseSource(workersPath);
assertContract(
  allJsxElementsUseIdentifier(
    workers,
    "Confirm",
    "overlayClassName",
    "NON_WALLET_MODAL_OVERLAY_CLASS",
  ) &&
    allJsxElementsUseIdentifier(
      workers,
      "ConfirmModalShell",
      "overlayClassName",
      "NON_WALLET_MODAL_OVERLAY_CLASS",
    ),
  workersPath,
  "worker administration dialogs must remain below authentication and wallet prompts",
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
assertContract(
  rootLayoutFunction &&
    !hasJsxElement(rootLayoutFunction, "RuntimeFavicon") &&
    !jsxAttributeHasStringValue(rootLayoutFunction, "link", "rel", "icon"),
  rootLayoutPath,
  "Core renderer must not mount favicon management or favicon links",
);

for (const headerPath of [
  "renderer/components/header/AppSidebarHeader.tsx",
  "renderer/components/layout/SmallScreenHeader.tsx",
  "renderer/components/layout/sidebar/WebSidebarHeader.tsx",
]) {
  const header = parseSource(headerPath);
  assertContract(
    !importsModulePrefix(
      header,
      "@/components/common/EnvironmentBadge",
    ) && !hasJsxElement(header, "EnvironmentBadge"),
    headerPath,
    "Core headers must use the native titlebar as the only environment indicator",
  );
}

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
