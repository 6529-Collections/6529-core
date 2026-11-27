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
const requestHelpers = require("../renderer/components/browser-connector/browserWalletRequest.helpers.ts");
const {
  validateBrowserWalletRequest,
} = require("./browser-wallet-requests.ts");
const address = `0x${"11".repeat(20)}`;
const REQUEST_ID = "R".repeat(43);
const RETURN_TOKEN = "T".repeat(43);
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

// Mount the real component and click its controls; only wallet hooks and the
// app server's answer are replaced. No Jest suite or wallet is started.
async function withConnector(
  run,
  method = "eth_signTypedData_v4",
  typedDataParams = undefined,
  options = {},
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
  const expiryTimers = [];
  const outgoing = [];
  const pending = [];
  const fetched = [];
  let calls = 0;
  let connectClicks = 0;
  // The browser's wallet connection for the app origin; null = not connected.
  const connection = (() => {
    const listeners = new Set();
    const snapshot = (value) =>
      value ? { address: value, isConnected: true } : { address: undefined, isConnected: false };
    let current = snapshot(
      options.connectedAs === undefined ? connected : options.connectedAs,
    );
    return {
      get: () => current,
      set: (value) => {
        current = snapshot(value);
        for (const listener of listeners) listener();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  })();
  const signArgs = [];
  const switched = [];
  const sign = (args) => {
    calls++;
    signArgs.push(args);
    return new Promise((resolve, reject) => pending.push({ resolve, reject }));
  };
  const signingParams =
    options.params ??
    (method === "personal_sign"
      ? ["0x6869", address]
      : typedDataParams ?? [
          address,
          JSON.stringify({
            domain: { name: "Fixture", chainId: "1" },
            types: { Grant: [{ name: "statement", type: "string" }] },
            primaryType: "Grant",
            message: { statement: "Fixture" },
          }),
        ]);
  // What the app issued: the same reduction the main process applies.
  const issued = validateBrowserWalletRequest({
    method,
    params: signingParams,
    address: connected,
    chainId: options.chainId ?? 1,
  });
  assert.equal(issued.ok, true, JSON.stringify(issued));
  const serverAnswer =
    options.serverAnswer ??
    { status: 200, body: { request: issued.view, returnToken: RETURN_TOKEN, expiresInMs: 60_000 } };
  const fakeFetch = async (url, init) => {
    fetched.push({ url, init });
    return {
      ok: serverAnswer.status === 200,
      status: serverAnswer.status,
      json: async () => serverAnswer.body,
    };
  };
  const mockWindow = {
    location: {
      hash: options.hash ?? `#request=${REQUEST_ID}`,
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
    BigInt,
    Date,
    window: mockWindow,
    setInterval: () => 1,
    clearInterval: () => {},
    // The return countdown is 3 s; the request expiry timer is kept apart.
    setTimeout: (callback, ms) =>
      ms === 3000 ? timers.push(callback) : expiryTimers.push(callback),
    clearTimeout: () => {},
    require: (name) => {
      if (name === "react" || name === "react/jsx-runtime" || name === "viem")
        return rendererRequire(name);
      if (name === "wagmi")
        return {
          useAccount: () => ({ chainId: options.walletChainId ?? 1 }),
          useSwitchChain: () => ({
            switchChainAsync: async (args) => switched.push(args),
          }),
          useSignMessage: () => ({ signMessageAsync: sign }),
          useSendTransaction: () => ({ sendTransactionAsync: sign }),
          useSignTypedData: () => ({ signTypedDataAsync: sign }),
        };
      if (name.endsWith("SeizeConnectContext"))
        return {
          useSeizeConnectContext: () =>
            React.useSyncExternalStore(
              connection.subscribe,
              connection.get,
            ),
        };
      // The shared connect control; clicking it stands in for the wallet
      // modal and connects the given address.
      if (name.endsWith("HeaderUserConnect"))
        return {
          __esModule: true,
          default: ({ label }) =>
            React.createElement(
              "button",
              {
                type: "button",
                onClick: () => {
                  connectClicks++;
                  if (options.connectsAs !== undefined)
                    connection.set(options.connectsAs);
                },
              },
              label,
            ),
        };
      if (name.endsWith("typedDataRequest"))
        return {
          parseTypedDataRequest,
          SIGN_TYPED_DATA_V4: "eth_signTypedData_v4",
        };
      if (name.endsWith("typedDataRoot")) return { assertTypedDataRoot };
      if (name.endsWith("browserConnector.helpers"))
        return {
          normalizeBrowserConnectorAddress: (value) =>
            value?.toLowerCase() ?? null,
        };
      if (name.endsWith("browserWalletRequest.helpers"))
        return {
          ...requestHelpers,
          fetchBrowserWalletRequest: (id) =>
            requestHelpers.fetchBrowserWalletRequest(id, fakeFetch),
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
          returnScheme: "localclassiccore6529",
          setCompleted: () => {},
        }),
      ),
    );
    await run({
      button: (text) =>
        [...dom.window.document.querySelectorAll("button")].find(
          (button) => button.textContent === text,
        ),
      text: () => dom.window.document.body.textContent,
      pending,
      timers,
      expiryTimers,
      outgoing,
      fetched,
      signArgs,
      switched,
      calls: () => calls,
      connectClicks: () => connectClicks,
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

// Values created inside the component realm, compared by content.
const plain = (value) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? `${item}n` : item,
    ),
  );

const returned = (link) => {
  assert.match(link, /^localclassiccore6529:\/\/connector\?data=/);
  return JSON.parse(new URL(link).searchParams.get("data"));
};

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
    assert.deepEqual(returned(outgoing[0]), {
      v: 2,
      id: REQUEST_ID,
      token: RETURN_TOKEN,
      error: "cancelled",
    });
  });
});

test("a failed browser signing request releases the guard for a retry", async () => {
  await withConnector(async ({ button, pending, calls, timers, signArgs }) => {
    await React.act(async () => button("Sign").click());
    // The exact bytes the app issued are signed, not a re-encoded string.
    assert.deepEqual(plain(signArgs[0]), {
      account: address,
      message: { raw: "0x6869" },
    });
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

test("the page reads the request from its own app server by the fragment id", async () => {
  await withConnector(async ({ fetched, text }) => {
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].url, "/_desktop/browser-wallet-request");
    assert.equal(fetched[0].init.method, "POST");
    assert.equal(fetched[0].init.headers["x-6529-browser-connector"], "1");
    assert.deepEqual(JSON.parse(fetched[0].init.body), { id: REQUEST_ID });
    assert.match(text(), /Sign a message/);
    assert.match(text(), /Message\s*hi/);
  }, "personal_sign");
});

test("a page without an app-issued request id offers nothing to sign", async () => {
  for (const hash of ["", "#request=short", "#requestId=x"]) {
    await withConnector(
      async ({ button, fetched, text }) => {
        assert.equal(fetched.length, 0);
        assert.equal(button("Sign"), undefined);
        assert.match(text(), /not issued by 6529 Desktop Classic/);
      },
      "personal_sign",
      undefined,
      { hash },
    );
  }
});

test("a request the app did not issue, or one that expired, is refused", async () => {
  for (const [error, copy] of [
    ["unknown", /not issued by 6529 Desktop Classic/],
    ["expired", /has expired/],
  ]) {
    await withConnector(
      async ({ button, text, calls }) => {
        assert.equal(button("Sign"), undefined);
        assert.match(text(), copy);
        assert.match(text(), /Nothing will be signed/);
        assert.equal(calls(), 0);
      },
      "personal_sign",
      undefined,
      { serverAnswer: { status: 404, body: { error } } },
    );
  }
});

test("a malformed app answer is refused", async () => {
  await withConnector(
    async ({ button, text }) => {
      assert.equal(button("Sign"), undefined);
      assert.match(text(), /not issued by 6529 Desktop Classic/);
    },
    "personal_sign",
    undefined,
    {
      serverAnswer: {
        status: 200,
        body: { request: { method: "eth_sign", address, chainId: 1 }, returnToken: RETURN_TOKEN, expiresInMs: 1 },
      },
    },
  );
});

const transferParams = [
  {
    from: address,
    to: `0x${"22".repeat(20)}`,
    value: "0xde0b6b3a7640000",
    data: "0xa9059cbb0000",
  },
];

test("a transaction shows its network, recipient, value and function before signing", async () => {
  await withConnector(
    async ({ button, text, signArgs, pending, timers, outgoing }) => {
      const body = text();
      assert.match(body, /Send a transaction/);
      assert.match(body, /Network\s*Ethereum/);
      assert.match(body, new RegExp(`To\\s*0x${"22".repeat(20)}`));
      assert.match(body, /Value\s*1 ETH/);
      assert.match(body, /0xa9059cbb \(not decoded\)/);
      assert.match(body, /cannot decode/);
      await React.act(async () => button("Sign").click());
      assert.deepEqual(plain(signArgs[0]), {
        account: address,
        to: `0x${"22".repeat(20)}`,
        data: "0xa9059cbb0000",
        value: "1000000000000000000n",
        chainId: 1,
      });
      const hash = `0x${"ab".repeat(32)}`;
      await React.act(async () => pending[0].resolve(hash));
      await React.act(async () => timers[0]());
      assert.deepEqual(returned(outgoing[0]), {
        v: 2,
        id: REQUEST_ID,
        token: RETURN_TOKEN,
        result: hash,
      });
    },
    "eth_sendTransaction",
    undefined,
    { params: transferParams },
  );
});

test("a transaction is never sent while the wallet is on another network", async () => {
  await withConnector(
    async ({ button, text, calls, switched }) => {
      assert.equal(button("Sign"), undefined);
      assert.match(text(), /Switch it to Sepolia \(test network\)/);
      await React.act(async () => button("Switch network").click());
      assert.deepEqual(plain(switched), [{ chainId: 11155111 }]);
      assert.equal(calls(), 0);
    },
    "eth_sendTransaction",
    undefined,
    { params: transferParams, chainId: 11155111, walletChainId: 1 },
  );
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
      assert.deepEqual(response, {
        v: 2,
        id: REQUEST_ID,
        token: RETURN_TOKEN,
        result: signature,
      });
    },
    "eth_signTypedData_v4",
    rpc.params,
  );
});

test("an open request stops offering Sign when the app's expiry passes", async () => {
  await withConnector(async ({ button, expiryTimers, text, calls }) => {
    assert.ok(button("Sign"));
    assert.equal(expiryTimers.length, 1);
    await React.act(async () => expiryTimers[0]());
    assert.equal(button("Sign"), undefined);
    assert.match(text(), /has expired/);
    assert.equal(calls(), 0);
  }, "personal_sign");
});

test("a browser without a wallet connection can connect on the request page and then sign", async () => {
  await withConnector(
    async ({ button, text, connectClicks, calls, pending, timers, outgoing }) => {
      assert.equal(button("Sign"), undefined);
      assert.match(text(), /Connect your browser wallet here/);
      assert.doesNotMatch(text(), /Close this window/);
      assert.ok(button("Cancel"));
      await React.act(async () => button("Connect wallet").click());
      assert.equal(connectClicks(), 1);
      // Connected as the requested wallet: the request continues in place.
      assert.ok(button("Sign"));
      await React.act(async () => button("Sign").click());
      assert.equal(calls(), 1);
      await React.act(async () => pending[0].resolve("0xsigned"));
      await React.act(async () => timers[0]());
      assert.deepEqual(returned(outgoing[0]), {
        v: 2,
        id: REQUEST_ID,
        token: RETURN_TOKEN,
        result: "0xsigned",
      });
    },
    "personal_sign",
    undefined,
    { connectedAs: null, connectsAs: address },
  );
});

test("connecting a different wallet on the request page still offers nothing to sign", async () => {
  await withConnector(
    async ({ button, calls }) => {
      await React.act(async () => button("Connect wallet").click());
      assert.equal(button("Sign"), undefined);
      assert.ok(button("Cancel"));
      assert.equal(calls(), 0);
    },
    "personal_sign",
    undefined,
    { connectedAs: null, connectsAs: `0x${"33".repeat(20)}` },
  );
});

test("a browser without a wallet connection can cancel the request back to the app", async () => {
  await withConnector(
    async ({ button, text, timers, outgoing, calls }) => {
      await React.act(async () => button("Cancel").click());
      assert.equal(button("Cancel"), undefined);
      // Once cancelled, the page offers no way to start a second outcome.
      assert.equal(button("Connect wallet"), undefined);
      assert.match(text(), /Cancelled\. Returning to 6529 Desktop Classic/);
      assert.equal(
        globalThis.document.activeElement?.getAttribute("role"),
        "status",
      );
      assert.equal(timers.length, 1);
      await React.act(async () => timers[0]());
      assert.deepEqual(returned(outgoing[0]), {
        v: 2,
        id: REQUEST_ID,
        token: RETURN_TOKEN,
        error: "cancelled",
      });
      assert.equal(calls(), 0);
    },
    "personal_sign",
    undefined,
    { connectedAs: null },
  );
});
