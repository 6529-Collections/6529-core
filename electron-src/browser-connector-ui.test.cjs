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
const { privateKeyToAccount } = rendererRequire("viem/accounts");
const { TypedDataEncoder, Wallet } = require("ethers");
const {
  parseTypedDataRequest,
} = require("../renderer/wagmiConfig/typedDataRequest.ts");
const {
  assertTypedDataRoot,
} = require("../renderer/wagmiConfig/typedDataRoot.ts");
const {
  signSeedWalletTypedData,
} = require("../renderer/wagmiConfig/seedWalletTypedData.ts");
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
async function withConnector(
  run,
  method = "eth_signTypedData_v4",
  typedDataParams = undefined,
) {
  // A supplied request is signed by its own (connected) wallet.
  const connected = typedDataParams?.[0]?.toLowerCase() ?? address;
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
  const signArgs = [];
  const sign = (args) => {
    calls++;
    signArgs.push(args);
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  const signingParams =
    method === "personal_sign"
      ? ["0x6869", address]
      : typedDataParams ?? [
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
          useSeizeConnectContext: () => ({
            address: connected,
            isConnected: true,
          }),
        };
      if (name.endsWith("typedDataRequest"))
        return {
          parseTypedDataRequest,
          SIGN_TYPED_DATA_V4: "eth_signTypedData_v4",
          getTypedDataRequestAddress: () => connected,
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
      signArgs,
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

test("a v2 device grant reaches both Desktop signers unchanged and signs the shared vector", async () => {
  // Grant v2 (D172), combined with encrypted messages: the shared app-grant
  // vector pinned by the frontend and backend. Hardhat's public test key #0.
  const key =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const grantId =
    "0x512beaf4b8e41c4e3ed31526432e8c8ec44215f2157244750c8395b1bb06acb3";
  const signature =
    "0xd48f0e4508c1c479fd8c746c7f1db8324a11daf65069ca1e71b849f6951770837abb735d30bffe543153fff9591be95ab2a8731e3b580be8dd113a5d51211e811c";
  const account = privateKeyToAccount(key);
  // Built as the frontend builds it: uint64 fields are bigints.
  const grant = {
    domain: {
      name: "6529 Device Grant",
      version: "2",
      salt: "0x4887f15a22b96f574a9f835b87e01e293dc7587acbfc13b5f224b89cd2d8c8aa",
    },
    types: {
      DeviceGrant: [
        { name: "statement", type: "string" },
        { name: "wallet", type: "address" },
        { name: "deviceKey", type: "bytes32" },
        { name: "scopes", type: "string" },
        { name: "mlsDeviceKey", type: "bytes32" },
        { name: "ciphersuites", type: "uint16[]" },
        { name: "issuedAt", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
        { name: "origin", type: "string" },
      ],
    },
    primaryType: "DeviceGrant",
    message: {
      statement:
        "Turn on signed messages on this device until 16 Apr 2027. This device will sign your posts, edits, deletes and reactions so anyone can verify they came from your wallet. It will also encrypt (send) and decrypt (read) your end-to-end encrypted messages, which 6529.io cannot read. It can't move funds, change your handle, add devices or act as an admin. No transaction, no gas, no token approvals. (Device key d75a9801...f707511a, encrypted messages key 3d4017c3...2af4660c)",
      wallet: account.address,
      deviceKey:
        "0xd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
      scopes: "post,edit,delete,react",
      mlsDeviceKey:
        "0x3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
      ciphersuites: [78],
      issuedAt: 1792324800n,
      expiresAt: 1807876800n,
      origin: "6529 Desktop",
    },
  };
  assert.equal(viem.hashTypedData(grant), grantId);

  // The request the renderer's wagmi call hands to a Desktop connector.
  let rpc;
  const client = viem.createWalletClient({
    transport: viem.custom({
      request: async (request) => {
        rpc = request;
        return signature;
      },
    }),
  });
  await client.signTypedData({ account: account.address, ...grant });
  assert.equal(rpc.method, "eth_signTypedData_v4");

  // Core seed wallet: Core's parser and ethers produce the shared signature.
  assert.equal(
    await signSeedWalletTypedData(new Wallet(key), rpc.params),
    signature,
  );

  // Browser connector: the page passes the same domain, types and message to
  // the browser wallet, which then signs the same digest.
  await withConnector(
    async ({ button, pending, timers, outgoing, signArgs }) => {
      await React.act(async () => button("Sign").click());
      assert.equal(signArgs.length, 1);
      const [args] = signArgs;
      assert.equal(args.account, account.address.toLowerCase());
      assert.equal(args.primaryType, "DeviceGrant");
      assert.deepEqual(args.domain, grant.domain);
      // Core copies the types into a null-prototype record.
      assert.deepEqual({ ...args.types }, grant.types);
      // viem's JSON-RPC encoding sends uint64s as decimal strings and the
      // address in lowercase; neither changes the digest.
      assert.deepEqual(args.message, {
        ...grant.message,
        wallet: account.address.toLowerCase(),
        issuedAt: "1792324800",
        expiresAt: "1807876800",
      });
      assert.equal(viem.hashTypedData(args), grantId);
      assert.equal(await account.signTypedData(args), signature);
      await React.act(async () => pending[0].resolve(signature));
      assert.equal(timers.length, 1);
      await React.act(async () => timers[0]());
      const response = JSON.parse(
        new URL(outgoing[0]).searchParams.get("data"),
      );
      assert.deepEqual(response, { requestId: "fixture", data: signature });
    },
    "eth_signTypedData_v4",
    rpc.params,
  );
});
