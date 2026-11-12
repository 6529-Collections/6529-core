import assert from "node:assert/strict";
import { test } from "node:test";
import { WalletKeychain, type MacWalletKeychainNative } from "./wallet-keychain";

const ADDRESS = "0x123456789012345678901234567890123456abcd";
const PASSWORD = "disposable-wallet-password";
const accept = async () => "save" as const;

function fixture() {
  const items = new Map<string, string>();
  const native: MacWalletKeychainNative = {
    contains: async (service, account) => items.has(`${service}:${account}`),
    read: async (service, account) => items.get(`${service}:${account}`) ?? null,
    save: async (service, account, password) => {
      items.set(`${service}:${account}`, password);
      return null;
    },
    forget: async (service, account) => {
      items.delete(`${service}:${account}`);
      return null;
    },
  };
  const make = (profile: string) =>
    new WalletKeychain(
      native,
      profile,
      async (address, password) =>
        address.toLowerCase() === ADDRESS && password === PASSWORD,
    );
  return { make, items, native };
}

test("stores only a verified password and isolates it by wallet and profile", async () => {
  const { make, items } = fixture();
  const keychain = make("/test/profile");
  assert.deepEqual(await keychain.offerSave(ADDRESS, "wrong", accept), {
    ok: false,
    code: "invalid-password",
  });
  assert.equal(items.size, 0);
  assert.deepEqual(await keychain.offerSave(ADDRESS, PASSWORD, accept), { ok: true, value: true });
  assert.equal(await keychain.hasSavedPassword(ADDRESS), true);
  assert.deepEqual(await make("/test/profile").request(ADDRESS), {
    ok: true,
    value: PASSWORD,
  });
  assert.deepEqual(await make("/test/other-profile").request(ADDRESS), {
    ok: false,
    code: "not-saved",
  });
  assert.deepEqual(await keychain.forget(ADDRESS), { ok: true, value: null });
  assert.equal(items.size, 0);
});

test("wallet deletion forgets its password and excludes concurrent saves", async () => {
  const { make, items } = fixture();
  const keychain = make("/test/profile");
  await keychain.offerSave(ADDRESS, PASSWORD, accept);
  let deleted = false;
  await keychain.deleteWallet(ADDRESS, async () => {
    assert.equal(items.size, 0);
    assert.deepEqual(await keychain.offerSave(ADDRESS, PASSWORD, accept), {
      ok: false,
      code: "busy",
    });
    deleted = true;
  });
  assert.equal(deleted, true);
});

test("a stale Keychain password is never returned", async () => {
  const { make, items } = fixture();
  const keychain = make("/test/profile");
  await keychain.offerSave(ADDRESS, PASSWORD, accept);
  for (const key of items.keys()) items.set(key, "stale");
  assert.deepEqual(await keychain.request(ADDRESS), {
    ok: false,
    code: "invalid-password",
  });
});

test("saving requires consent and a declined offer is not repeated in the same session", async () => {
  const { make, items } = fixture();
  const keychain = make("/test/profile");
  let offers = 0;
  const decline = async () => {
    offers++;
    return "skip" as const;
  };
  assert.deepEqual(await keychain.offerSave(ADDRESS, PASSWORD, decline), {
    ok: true,
    value: false,
  });
  await keychain.offerSave(ADDRESS, PASSWORD, decline);
  assert.equal(offers, 1);
  assert.equal(items.size, 0);

  const nextSession = make("/test/profile");
  await nextSession.offerSave(ADDRESS, PASSWORD, accept);
  await nextSession.offerSave(ADDRESS, PASSWORD, decline);
  assert.equal(offers, 1);
  assert.equal(items.size, 1);
});
