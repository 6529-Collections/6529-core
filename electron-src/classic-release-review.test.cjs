const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function loadRenderer(file, globals, dependencies) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout,
    ...globals,
    require(name) {
      assert.ok(
        Object.hasOwn(dependencies, name),
        `Unexpected dependency ${name}`,
      );
      return dependencies[name];
    },
  });
  return exports;
}

function connectorHarness(getInfo, storedConnection = null) {
  const opened = [];
  const listeners = [];
  const removed = [];
  const connectorModule = loadRenderer(
    "renderer/wagmiConfig/browserConnector.ts",
    {
      window: {
        store: {
          get: async () => storedConnection,
          remove: async (key) => removed.push(key),
        },
        dispatchEvent: () => {},
        api: {
          getInfo,
          onWalletConnection: (listener) => listeners.push(listener),
        },
      },
      CustomEvent,
    },
    {
      wagmi: { createConnector: (factory) => factory({}) },
      "viem/chains": { mainnet: { id: 1 }, sepolia: { id: 11155111 } },
      "@/services/auth/auth.utils": {
        getWalletAddress: () => null,
        getConnectedWalletAccounts: () => [],
      },
      "@/shared/native-auth-result": {},
      "@/services/auth/native-refresh-token-storage": {},
      "@/services/auth/session-v2.utils": {},
      "@/components/browser-connector/browserConnector.helpers": {
        BROWSER_CONNECTOR_REQUEST_TIMEOUT_MS: 120000,
      },
      "./typedDataRequest": { SIGN_TYPED_DATA_V4: "eth_signTypedData_v4" },
    },
  );
  return {
    connector: connectorModule.browserConnector({
      name: "Browser",
      id: "browser",
      icon: "browser.png",
      openUrlFn: (url) => opened.push(url),
    }),
    opened,
    listeners,
    removed,
  };
}

for (const scheme of ["localclassiccore6529", "stagingclassiccore6529"]) {
  test(`connection waits for ${scheme} and the actual port`, async () => {
    let finishInfo;
    const info = new Promise((resolve) => {
      finishInfo = resolve;
    });
    let reads = 0;
    const { connector, opened, listeners } = connectorHarness(() => {
      reads++;
      return info;
    });
    // Provider and connection startup share one initialization, even concurrently.
    const provider = connector.getProvider();
    const connection = connector.connect();
    const rejected = assert.rejects(connection, /fixture declined/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(opened.length, 0);
    finishInfo({ scheme, port: 6530 });
    await provider;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(reads, 1);
    assert.equal(listeners.length, 1);
    assert.equal(opened.length, 1);
    const url = new URL(opened[0]);
    assert.equal(url.port, "6530");
    assert.equal(url.searchParams.get("scheme"), scheme);
    listeners[0](null, {
      requestId: url.searchParams.get("requestId"),
      data: { error: "fixture declined" },
    });
    await rejected;
  });
}

test("desktop-info failure rejects connection and permits a clean retry", async () => {
  let reads = 0;
  const { connector, opened, listeners } = connectorHarness(async () => {
    if (++reads === 1) throw new Error("Desktop info unavailable");
    return { scheme: "stagingclassiccore6529", port: 6531 };
  });
  await assert.rejects(connector.connect(), /Desktop info unavailable/);
  assert.equal(opened.length, 0);
  assert.equal(listeners.length, 0);
  const connection = connector.connect();
  const rejected = assert.rejects(connection, /fixture declined/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 2);
  assert.equal(listeners.length, 1);
  const url = new URL(opened[0]);
  assert.equal(url.port, "6531");
  listeners[0](null, {
    requestId: url.searchParams.get("requestId"),
    data: { error: "fixture declined" },
  });
  await rejected;
});

for (const infoFails of [false, true]) {
  test(`disconnect clears stored accounts after pending initialization ${infoFails ? "fails" : "succeeds"}`, async () => {
    let finishInfo;
    let failInfo;
    const info = new Promise((resolve, reject) => {
      finishInfo = resolve;
      failInfo = reject;
    });
    const storedConnection = JSON.stringify({
      accounts: ["0x00000000000000000000000000000000000000aa"],
      chainId: 1,
    });
    const { connector, removed } = connectorHarness(() => info, storedConnection);
    const initialization = connector.getProvider();
    const initialized = infoFails
      ? assert.rejects(initialization, /Desktop info unavailable/)
      : initialization;
    let disconnected = false;
    const disconnection = connector.disconnect().then(() => {
      disconnected = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(disconnected, false);
    assert.equal(removed.length, 0);
    if (infoFails) failInfo(new Error("Desktop info unavailable"));
    else finishInfo({ scheme: "stagingclassiccore6529", port: 6530 });
    await Promise.all([initialized, disconnection]);
    assert.equal((await connector.getAccounts()).length, 0);
    assert.deepEqual(removed, ["seize-app-connection-browser"]);
  });
}

function hostedFeed(fetch) {
  return loadRenderer(
    "renderer/lib/release-section/hostedFeed.ts",
    {
      fetch,
      AbortSignal,
      Uint8Array,
    },
    {
      "@/lib/fetch/fetchDeadline": {
        discardResponse: (response) => {
          void response.body?.cancel();
        },
      },
      "@/lib/validator-page/feedResponse": {
        RELEASE_LIST_PAIR_HEADER: "X-Release-List-Pair",
      },
    },
  );
}

test("hosted release reads preserve exact signed bytes across chunks", async () => {
  const bytes = new Uint8Array([0xff, 0, 13, 10, 0xc3, 0xa9]);
  const feed = hostedFeed(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 5));
            controller.enqueue(bytes.subarray(5));
            controller.close();
          },
        }),
      ),
  );
  const pair = await feed.readHostedReleasePair("desktop");
  assert.equal(pair.state, "ok");
  assert.deepEqual(pair.feed.body, bytes);
  assert.deepEqual(pair.signature.body, bytes);
});

for (const [name, limit, oversizeSignature] of [
  ["feed", 64 * 1024, false],
  ["signature", 1024, true],
]) {
  test(`hosted release reads cancel an oversized chunked ${name}`, async () => {
    let chunks = 0;
    let canceled = false;
    const feed = hostedFeed(async (url) => {
      if (url.endsWith(".sig") !== oversizeSignature) return new Response();
      return new Response(
        new ReadableStream(
          {
            pull(controller) {
              chunks++;
              controller.enqueue(new Uint8Array(limit));
            },
            cancel() {
              canceled = true;
            },
          },
          { highWaterMark: 0 },
        ),
      );
    });
    const pair = await feed.readHostedReleasePair("desktop");
    assert.equal(pair.state, "error");
    assert.equal(pair.reason, "hosted feed object is too large");
    assert.equal(canceled, true);
    assert.equal(chunks, 2);
  });
}
