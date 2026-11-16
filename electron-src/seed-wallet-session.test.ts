import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Wallet, getBytes, verifyMessage } from "ethers";
import { MNEMONIC_NA } from "../electron-constants";
import { encryptData } from "../shared/encrypt";
import type { ISeedWallet, SeedWalletRequest } from "../shared/types";
import { SeedWalletSession } from "./seed-wallet-session";
import { signSeedWalletRequest } from "./seed-wallet-signing";

async function fixture() {
  const wallet = Wallet.createRandom();
  const pass = "fixture for local wallet encryption";
  const [addressHash, privateKey] = await Promise.all([
    encryptData(wallet.address, pass),
    encryptData(wallet.privateKey, pass),
  ]);
  const record: ISeedWallet = {
    address: wallet.address,
    address_hashed: addressHash,
    private_key: privateKey,
    mnemonic: MNEMONIC_NA,
    name: "Fixture wallet",
    imported: true,
  };
  let connection: string | undefined = JSON.stringify({
    accounts: [wallet.address],
    chainId: 1,
  });
  const settled: string[] = [];
  let savedReads = 0;
  const session = new SeedWalletSession(
    async (address) => (address === record.address ? record : null),
    async () => {
      savedReads++;
      return { ok: true, value: pass };
    },
    () => connection,
    (requestId) => settled.push(requestId),
  );
  const request: SeedWalletRequest = {
    requestId: "fixture-id",
    from: record.address,
    chainId: 1,
    method: "personal_sign",
    params: ["0x6100ff", record.address],
  };
  return {
    pass,
    record,
    request,
    session,
    settled,
    savedReads: () => savedReads,
    disconnect: () => {
      connection = undefined;
      session.connectionChanged();
    },
  };
}

test("saved unlock requires device authentication and a separate Unlock action", async () => {
  const { record, request, session, savedReads } = await fixture();
  const attempt = randomUUID();
  assert.deepEqual(await session.unlock(record.address, undefined, () => true, attempt), {
    ok: false,
    code: "unavailable",
  });
  assert.deepEqual(await session.prepareSavedUnlock(
    record.address, attempt, async () => ({ ok: true, value: null }), () => true,
  ), { ok: true, value: null });
  assert.equal(savedReads(), 0);
  assert.deepEqual(await session.unlock(record.address, undefined, () => true, randomUUID()), {
    ok: false,
    code: "unavailable",
  });
  const pending = session.start(request, (display) =>
    assert.deepEqual(display, request),
  );
  assert.deepEqual(
    await session.unlock(record.address, undefined, () => true, attempt),
    { ok: true, value: null },
  );
  assert.equal(savedReads(), 1);
  assert.deepEqual(await session.unlock(record.address, undefined, () => true, attempt), {
    ok: false,
    code: "unavailable",
  });
  await session.confirm("another-id");
  await session.confirm(request.requestId);
  const result = await pending;
  assert.ok(result.ok);
  assert.equal(
    verifyMessage(getBytes(request.params[0]), result.value),
    record.address,
  );
});

test("closing the modal invalidates an in-flight authentication and manual entry still works", async () => {
  const { pass, record, session, savedReads } = await fixture();
  const attempt = randomUUID();
  let finishAuthentication!: () => void;
  const prepared = session.prepareSavedUnlock(record.address, attempt, async (signal) => {
    await new Promise<void>((resolve) => { finishAuthentication = resolve; });
    assert.equal(signal.aborted, true);
    return { ok: true, value: null };
  }, () => true);
  session.cancelSavedUnlock(attempt);
  finishAuthentication();
  assert.deepEqual(await prepared, { ok: false, code: "cancelled" });
  assert.deepEqual(await session.unlock(record.address, undefined, () => true, attempt), {
    ok: false,
    code: "unavailable",
  });
  assert.equal(savedReads(), 0);
  assert.deepEqual(await session.unlock(record.address, pass, () => true), {
    ok: true,
    value: null,
  });
});

test("rejecting during signing settles only the cancelled request", async () => {
  const { pass, record, request, session, settled } = await fixture();
  assert.deepEqual(await session.unlock(record.address, pass, () => true), {
    ok: true,
    value: null,
  });
  const pending = session.start(request, () => undefined);
  const signing = session.confirm(request.requestId);
  session.reject(request.requestId);
  const next = { ...request, requestId: "next-request" };
  const nextPending = session.start(next, () => undefined);

  assert.deepEqual(await pending, {
    ok: false,
    code: "rejected",
    message: "Request rejected",
  });
  await signing;
  assert.deepEqual(settled, [request.requestId]);
  await session.confirm(next.requestId);
  assert.equal((await nextPending).ok, true);
  assert.deepEqual(settled, [request.requestId, next.requestId]);
});

test("a mismatched transaction chain is rejected before the RPC call", async () => {
  const wallet = new Wallet(Wallet.createRandom().privateKey);
  await assert.rejects(
    signSeedWalletRequest(
      wallet,
      {
        requestId: "wrong-chain",
        from: wallet.address,
        chainId: 1,
        method: "eth_sendTransaction",
        params: [{ to: wallet.address, chainId: "0xaa36a7" }],
      },
      () => undefined,
    ),
    /Wallet transaction chain does not match the connected chain/,
  );
});

test("a mismatched transaction sender is rejected before the RPC call", async () => {
  const wallet = new Wallet(Wallet.createRandom().privateKey);
  await assert.rejects(
    signSeedWalletRequest(
      wallet,
      {
        requestId: "wrong-sender",
        from: wallet.address,
        chainId: 1,
        method: "eth_sendTransaction",
        params: [{ from: "0x0000000000000000000000000000000000000001" }],
      },
      () => undefined,
    ),
    /Wallet transaction sender does not match the connected wallet/,
  );
});

test("disconnect rejects pending signing and invalidates an in-flight unlock", async () => {
  const { disconnect, pass, record, request, session } = await fixture();
  const pending = session.start(request, () => undefined);
  const unlocking = session.unlock(record.address, pass, () => true);
  disconnect();
  assert.deepEqual(await unlocking, { ok: false, code: "unavailable" });
  await session.confirm(request.requestId);
  assert.deepEqual(await pending, {
    ok: false,
    code: "rejected",
    message: "Request rejected",
  });
});

test("recovery requires a typed password and approval and returns only the requested field", async () => {
  const { pass, record, session } = await fixture();
  assert.deepEqual(
    await session.recover(
      record.address,
      "mnemonic",
      undefined,
      async () => assert.fail("recovery must require a typed password before showing the dialog"),
    ),
    { ok: false, code: "invalid-password" },
  );
  assert.deepEqual(
    await session.recover(
      record.address,
      "mnemonic",
      pass,
      async () => false,
    ),
    { ok: false, code: "cancelled" },
  );
  assert.deepEqual(
    await session.recover(
      record.address,
      "mnemonic",
      pass,
      async () => true,
    ),
    { ok: true, value: { mnemonic: MNEMONIC_NA } },
  );
});
