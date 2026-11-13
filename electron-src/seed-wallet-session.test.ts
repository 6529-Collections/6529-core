import assert from "node:assert/strict";
import test from "node:test";
import { Wallet, getBytes, verifyMessage } from "ethers";
import { MNEMONIC_NA } from "../electron-constants";
import { encryptData } from "../shared/encrypt";
import type { ISeedWallet, SeedWalletRequest } from "../shared/types";
import { SeedWalletSession } from "./seed-wallet-session";

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
  const session = new SeedWalletSession(
    async (address) => (address === record.address ? record : null),
    async () => ({ ok: true, value: pass }),
    () => connection,
    () => undefined,
  );
  const request: SeedWalletRequest = {
    requestId: "fixture-id",
    from: record.address,
    chainId: 1,
    method: "personal_sign",
    params: ["0x6100ff", record.address],
  };
  return {
    record,
    request,
    session,
    disconnect: () => {
      connection = undefined;
      session.connectionChanged();
    },
  };
}

test("saved unlock returns status and approval returns only the signature for the pending request", async () => {
  const { record, request, session } = await fixture();
  const pending = session.start(request, (display) =>
    assert.deepEqual(display, request),
  );
  assert.deepEqual(
    await session.unlock(record.address, undefined, () => true),
    { ok: true, value: null },
  );
  await session.confirm("another-id");
  await session.confirm(request.requestId);
  const result = await pending;
  assert.ok(result.ok);
  assert.equal(
    verifyMessage(getBytes(request.params[0]), result.value),
    record.address,
  );
});

test("disconnect rejects pending signing and invalidates an in-flight unlock", async () => {
  const { disconnect, record, request, session } = await fixture();
  const pending = session.start(request, () => undefined);
  const unlocking = session.unlock(record.address, undefined, () => true);
  disconnect();
  assert.deepEqual(await unlocking, { ok: false, code: "unavailable" });
  await session.confirm(request.requestId);
  assert.deepEqual(await pending, {
    ok: false,
    code: "rejected",
    message: "Request rejected",
  });
});

test("recovery requires approval and returns only the requested field", async () => {
  const { record, session } = await fixture();
  assert.deepEqual(
    await session.recover(
      record.address,
      "mnemonic",
      undefined,
      async () => false,
    ),
    { ok: false, code: "cancelled" },
  );
  assert.deepEqual(
    await session.recover(
      record.address,
      "mnemonic",
      undefined,
      async () => true,
    ),
    { ok: true, value: { mnemonic: MNEMONIC_NA } },
  );
});
