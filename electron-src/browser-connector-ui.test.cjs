const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { test } = require("node:test");
const ts = require("typescript");
const rendererRequire = createRequire(path.resolve("renderer/package.json"));
const { JSDOM } = createRequire(
  rendererRequire.resolve("jest-environment-jsdom"),
)("jsdom");
const React = rendererRequire("react");
const viem = rendererRequire("viem");
const { TypedDataEncoder } = require("ethers");
const {
  parseTypedDataRequest,
} = require("../renderer/wagmiConfig/typedDataRequest.ts");
const {
  assertTypedDataRoot,
} = require("../renderer/wagmiConfig/typedDataRoot.ts");
const address = `0x${"11".repeat(20)}`;
const source = fs.readFileSync(
  "renderer/components/browser-connector/BrowserConnectorProvider.tsx",
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;

// Mount the real component and click its controls; only wallet/network hooks
// and Next's query source are replaced. No Jest suite or wallet is started.
async function withConnector(run, method = "eth_signTypedData_v4") {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://fixture.invalid/browser-connector",
  });
  const saved = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const timers = [];
  const outgoing = [];
  const pending = [];
  let calls = 0;
  const sign = () => {
    calls++;
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  const signingParams =
    method === "personal_sign"
      ? ["0x6869", address]
      : [
          address,
          JSON.stringify({
            domain: { name: "Fixture", chainId: "1" },
            types: { Grant: [{ name: "statement", type: "string" }] },
            primaryType: "Grant",
            message: { statement: "Fixture" },
          }),
        ];
  const params = new URLSearchParams({
    method,
    params: encodeURIComponent(JSON.stringify(signingParams)),
    requestId: "fixture",
  });
  const mockWindow = {
    location: {
      set href(value) {
        outgoing.push(value);
      },
    },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    Error,
    URLSearchParams,
    window: mockWindow,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (callback) => timers.push(callback),
    require: (name) => {
      if (name === "react" || name === "react/jsx-runtime" || name === "viem")
        return rendererRequire(name);
      if (name === "next/navigation") return { useSearchParams: () => params };
      if (name === "wagmi")
        return {
          useChainId: () => 1,
          useSignMessage: () => ({ signMessageAsync: sign }),
          useSendTransaction: () => ({ sendTransactionAsync: sign }),
          useSignTypedData: () => ({ signTypedDataAsync: sign }),
        };
      if (name.endsWith("SeizeConnectContext"))
        return {
          useSeizeConnectContext: () => ({ address, isConnected: true }),
        };
      if (name.endsWith("typedDataRequest"))
        return {
          parseTypedDataRequest,
          SIGN_TYPED_DATA_V4: "eth_signTypedData_v4",
          getTypedDataRequestAddress: () => address,
        };
      if (name.endsWith("typedDataRoot")) return { assertTypedDataRoot };
      if (name.endsWith("browserConnector.helpers"))
        return {
          normalizeBrowserConnectorAddress: (value) =>
            value?.toLowerCase() ?? null,
        };
      if (name.endsWith("BrowserConnectorWalletIntentNotice"))
        return { __esModule: true, default: () => null };
      if (name.endsWith(".css")) return {};
      throw new Error(`Unexpected component import ${name}`);
    },
  });
  vm.runInContext(compiled, context);
  const { createRoot } = rendererRequire("react-dom/client");
  const root = createRoot(dom.window.document.getElementById("root"));
  try {
    await React.act(async () =>
      root.render(
        React.createElement(exports.default, {
          returnScheme: "localcore6529",
          setCompleted: () => {},
        }),
      ),
    );
    await run({
      button: (text) =>
        [...dom.window.document.querySelectorAll("button")].find(
          (button) => button.textContent === text,
        ),
      pending,
      timers,
      outgoing,
      calls: () => calls,
    });
  } finally {
    await React.act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

test("browser Sign stays single-flight while Cancel immediately wins over a late approval", async () => {
  await withConnector(async ({ button, pending, timers, outgoing, calls }) => {
    await React.act(async () => {
      button("Sign").click();
      button("Sign").click();
    });
    assert.equal(calls(), 1);
    assert.equal(button("Signing…").disabled, true);
    assert.equal(button("Cancel").disabled, false);
    await React.act(async () => button("Cancel").click());
    await React.act(async () => pending[0].resolve("0xlate-signature"));
    assert.equal(timers.length, 1);
    await React.act(async () => timers[0]());
    assert.equal(outgoing.length, 1);
    const response = JSON.parse(new URL(outgoing[0]).searchParams.get("data"));
    assert.deepEqual(response, {
      requestId: "fixture",
      data: { error: "Cancelled" },
    });
  });
});

test("a failed browser signing request releases the guard for a retry", async () => {
  await withConnector(async ({ button, pending, calls, timers }) => {
    await React.act(async () => button("Sign").click());
    await React.act(async () =>
      pending[0].reject(new Error("Wallet rejected request")),
    );
    assert.equal(button("Sign").disabled, false);
    await React.act(async () => button("Sign").click());
    assert.equal(calls(), 2);
    await React.act(async () => pending[1].resolve("0xsigned"));
    assert.equal(button("Signed").disabled, true);
    assert.equal(timers.length, 1);
  }, "personal_sign");
});

test("browser viem transport retains string chain IDs and the Core EIP-712 signing hash", async () => {
  const types = { Grant: [{ name: "statement", type: "string" }] };
  const message = { statement: "Fixture grant" };
  for (const chainId of [
    "1",
    "0x1",
    "9007199254740993",
    (2n ** 256n - 1n).toString(),
  ]) {
    const domain = { name: "Fixture", version: "1", chainId };
    const typed = parseTypedDataRequest([
      address,
      JSON.stringify({ domain, types, primaryType: "Grant", message }),
    ]);
    let rpc;
    const client = viem.createWalletClient({
      transport: viem.custom({
        request: async (request) => {
          rpc = request;
          return `0x${"ab".repeat(65)}`;
        },
      }),
    });
    await client.signTypedData({
      account: address,
      ...typed,
      types: typed.types,
    });
    assert.equal(rpc.method, "eth_signTypedData_v4");
    const sent = JSON.parse(rpc.params[1]);
    assert.deepEqual(
      sent.types.EIP712Domain.find((field) => field.name === "chainId"),
      { name: "chainId", type: "uint256" },
    );
    assert.equal(BigInt(sent.domain.chainId), BigInt(chainId));
    assert.equal(
      viem.hashTypedData({ ...typed }),
      TypedDataEncoder.hash(domain, types, message),
    );
  }
});
