import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hexlify, toUtf8Bytes, Wallet } from "ethers";
import {
  BrowserWalletRequestStore,
  isBrowserWalletReturnFormat,
  validateBrowserWalletRequest,
  type BrowserWalletOutcome,
} from "./browser-wallet-requests";

// Hardhat's public test key #0; never holds funds.
const wallet = new Wallet(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const address = wallet.address.toLowerCase();
const other = `0x${"22".repeat(20)}`;
const messageHex = hexlify(toUtf8Bytes("Sign this message to create a 6529 drop."));
const typedData = {
  domain: { name: "Fixture", version: "1", chainId: 1 },
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
    ],
    Grant: [
      { name: "statement", type: "string" },
      { name: "wallet", type: "address" },
    ],
  },
  primaryType: "Grant",
  message: { statement: "Fixture grant", wallet: address },
};

const personalSign = (overrides: Record<string, unknown> = {}) => ({
  method: "personal_sign",
  params: [messageHex, address],
  address,
  chainId: 1,
  ...overrides,
});

function createStore(options: { session?: boolean; now?: () => number } = {}) {
  const timers: Array<() => void> = [];
  let counter = 0;
  const store = new BrowserWalletRequestStore({
    hasSession: () => options.session ?? true,
    now: options.now,
    random: (size) => Buffer.alloc(size, ++counter),
    setTimer: (callback) => {
      timers.push(callback);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  });
  return { store, timers };
}

function issue(store: BrowserWalletRequestStore, input: unknown) {
  const created = store.create(input);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("not created");
  const claim = store.claim(created.id);
  assert.equal(claim.ok, true);
  if (!claim.ok) throw new Error("not claimed");
  return { ...created, token: claim.returnToken, claim };
}

describe("browser wallet request validation", () => {
  it("refuses raw hash signing and methods it does not forward", () => {
    for (const method of ["eth_sign", "eth_accounts", "wallet_addEthereumChain", undefined]) {
      const result = validateBrowserWalletRequest(personalSign({ method }));
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.code, "unsupported");
    }
  });

  it("refuses requests for another address or an unsupported network", () => {
    for (const input of [
      personalSign({ params: [messageHex, other] }),
      personalSign({ address: "nope" }),
      personalSign({ chainId: 137 }),
      personalSign({ chainId: 1.5 }),
      {
        method: "eth_sendTransaction",
        params: [{ from: other, to: other, value: "0x1" }],
        address,
        chainId: 1,
      },
      {
        method: "eth_signTypedData_v4",
        params: [other, JSON.stringify(typedData)],
        address,
        chainId: 1,
      },
      {
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify({ ...typedData, domain: { ...typedData.domain, chainId: 137 } })],
        address,
        chainId: 1,
      },
    ]) {
      const result = validateBrowserWalletRequest(input);
      assert.equal(result.ok, false, JSON.stringify(input));
    }
  });

  it("refuses transactions for another network, without a recipient or with unknown fields", () => {
    const tx = (fields: Record<string, unknown>) => ({
      method: "eth_sendTransaction",
      params: [{ from: address, to: other, ...fields }],
      address,
      chainId: 1,
    });
    assert.equal(validateBrowserWalletRequest(tx({ chainId: "0xaa36a7" })).ok, false);
    assert.equal(validateBrowserWalletRequest(tx({ to: undefined })).ok, false);
    assert.equal(validateBrowserWalletRequest(tx({ authorizationList: [] })).ok, false);
    assert.equal(validateBrowserWalletRequest(tx({ value: "1000" })).ok, false);
    assert.equal(validateBrowserWalletRequest(tx({ data: "0x12", input: "0x34" })).ok, false);
  });

  it("refuses typed data whose primary type is not its root type", () => {
    const result = validateBrowserWalletRequest({
      method: "eth_signTypedData_v4",
      params: [
        address,
        JSON.stringify({
          ...typedData,
          types: { ...typedData.types, Outer: [{ name: "grant", type: "Grant" }] },
        }),
      ],
      address,
      chainId: 1,
    });
    assert.equal(result.ok, false);
  });

  it("keeps the exact message bytes, recipient, value, data and network", () => {
    const text = validateBrowserWalletRequest(personalSign({ params: ["hello", address] }));
    assert.deepEqual(text.ok && text.view, {
      method: "personal_sign",
      address,
      chainId: 1,
      message: "0x68656c6c6f",
    });
    const tx = validateBrowserWalletRequest({
      method: "eth_sendTransaction",
      params: [{ from: address, to: other, value: "0x1", data: "0xA9059CBB", gas: "0x5208" }],
      address,
      chainId: 11155111,
    });
    assert.deepEqual(tx.ok && tx.view, {
      method: "eth_sendTransaction",
      address,
      chainId: 11155111,
      transaction: { from: address, to: other, value: "0x1", data: "0xa9059cbb" },
    });
  });
});

describe("browser wallet request store", () => {
  it("issues only for a signed-in address", () => {
    const { store } = createStore({ session: false });
    const created = store.create(personalSign());
    assert.equal(!created.ok && created.code, "not-signed-in");
  });

  it("gives each request a random 256-bit id and caps open requests", () => {
    const { store } = createStore();
    const ids = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const created = store.create(personalSign());
      assert.equal(created.ok, true);
      if (created.ok) {
        assert.match(created.id, /^[A-Za-z0-9_-]{43}$/);
        ids.add(created.id);
      }
    }
    assert.equal(ids.size, 4);
    const fifth = store.create(personalSign());
    assert.equal(!fifth.ok && fifth.code, "busy");
  });

  it("refuses an id the app did not issue", () => {
    const { store } = createStore();
    store.create(personalSign());
    for (const id of ["A".repeat(43), "x", undefined, 42, "../../etc"]) {
      assert.deepEqual(store.claim(id), { ok: false, code: "unknown" });
    }
  });

  it("expires requests on the app clock and settles them as expired", async () => {
    let now = 1_000;
    const { store, timers } = createStore({ now: () => now });
    const created = store.create(personalSign());
    assert.ok(created.ok);
    if (!created.ok) return;
    now += 120_001;
    assert.deepEqual(store.claim(created.id), { ok: false, code: "expired" });
    assert.deepEqual(await created.done, {
      ok: false,
      code: "expired",
      message: "The wallet request expired.",
    });
    assert.equal(store.size, 0);
    timers.forEach((timer) => timer());
    assert.equal(store.size, 0);
  });

  it("accepts a verified signature once and drops duplicates", async () => {
    const { store } = createStore();
    const request = issue(store, personalSign());
    const signature = await wallet.signMessage(toUtf8Bytes("Sign this message to create a 6529 drop."));
    const payload = { v: 2, id: request.id, token: request.token, result: signature };
    assert.equal(store.complete(payload), true);
    assert.deepEqual(await request.done, { ok: true, value: signature });
    assert.equal(store.complete(payload), false);
    assert.deepEqual(store.claim(request.id), { ok: false, code: "unknown" });
  });

  it("drops results without the request's return token", async () => {
    const { store } = createStore();
    const request = issue(store, personalSign());
    const signature = await wallet.signMessage(toUtf8Bytes("x"));
    assert.equal(store.complete({ v: 2, id: request.id, token: "A".repeat(43), result: signature }), false);
    assert.equal(store.complete({ v: 2, id: "B".repeat(43), token: request.token, result: signature }), false);
    assert.equal(store.complete({ requestId: request.id, data: signature }), false);
    assert.equal(
      store.complete({ v: 2, id: request.id, token: request.token, result: signature, extra: 1 }),
      false,
    );
    assert.equal(store.size, 1);
  });

  it("drops late results after expiry", () => {
    let now = 0;
    const { store } = createStore({ now: () => now });
    const request = issue(store, personalSign());
    now = 200_000;
    assert.equal(
      store.complete({ v: 2, id: request.id, token: request.token, error: "cancelled" }),
      false,
    );
  });

  it("fails a signature that does not recover to the bound address", async () => {
    const { store } = createStore();
    const request = issue(store, personalSign());
    const wrong = await Wallet.createRandom().signMessage(toUtf8Bytes("Sign this message to create a 6529 drop."));
    assert.equal(store.complete({ v: 2, id: request.id, token: request.token, result: wrong }), true);
    const outcome = (await request.done) as Extract<BrowserWalletOutcome, { ok: false }>;
    assert.equal(outcome.ok, false);
    assert.equal(outcome.code, "failed");
  });

  it("verifies typed data signatures against the issued typed data", async () => {
    const { store } = createStore();
    const request = issue(store, {
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typedData)],
      address,
      chainId: 11155111,
    });
    assert.equal(request.claim.ok && request.claim.request.method, "eth_signTypedData_v4");
    const { EIP712Domain: _domain, ...types } = typedData.types;
    const signature = await wallet.signTypedData(typedData.domain, types, typedData.message);
    assert.equal(store.complete({ v: 2, id: request.id, token: request.token, result: signature }), true);
    assert.deepEqual(await request.done, { ok: true, value: signature });
  });

  it("accepts only a well-formed transaction hash", async () => {
    const { store } = createStore();
    const tx = {
      method: "eth_sendTransaction",
      params: [{ from: address, to: other, value: "0x0" }],
      address,
      chainId: 1,
    };
    const bad = issue(store, tx);
    store.complete({ v: 2, id: bad.id, token: bad.token, result: "0x1234" });
    assert.equal(((await bad.done) as { code?: string }).code, "failed");
    const good = issue(store, tx);
    const hash = `0x${"ab".repeat(32)}`;
    store.complete({ v: 2, id: good.id, token: good.token, result: hash });
    assert.deepEqual(await good.done, { ok: true, value: hash });
  });

  it("reports a cancellation with a sanitized message", async () => {
    const { store } = createStore();
    const request = issue(store, personalSign());
    assert.equal(
      store.complete({ v: 2, id: request.id, token: request.token, error: "rejected", message: "no\u0000thanks" }),
      true,
    );
    assert.deepEqual(await request.done, { ok: false, code: "rejected", message: "no thanks" });
  });

  it("recognizes only the app-issued result format", () => {
    assert.equal(isBrowserWalletReturnFormat({ v: 2 }), true);
    assert.equal(isBrowserWalletReturnFormat({ requestId: "x", data: {} }), false);
  });
});

describe("browser wallet request lifecycle", () => {
  it("settles open requests as cancelled when the app window goes away", async () => {
    const { store } = createStore();
    const created = store.create(personalSign());
    assert.ok(created.ok);
    if (!created.ok) return;
    store.cancelAll();
    assert.equal(store.size, 0);
    assert.equal(((await created.done) as { code?: string }).code, "cancelled");
    assert.deepEqual(store.claim(created.id), { ok: false, code: "unknown" });
  });
});
