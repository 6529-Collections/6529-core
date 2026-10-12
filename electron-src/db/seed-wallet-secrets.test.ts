import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MNEMONIC_NA } from "../../electron-constants";
import {
  decryptData,
  encryptData,
  getEncryptionVersion,
} from "../../shared/encrypt";
import { encryptSeedWalletSecrets } from "./seed-wallet-secrets";

// Written by shared/encrypt.ts as released in v0.3.14, for the well-known
// Hardhat test mnemonic. Wallets already on users' machines look like this.
const LEGACY_WALLET = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  privateKey:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  mnemonic: "test test test test test test test test test test test junk",
  password: "legacy-fixture-Passw0rd!",
  address_hashed:
    "fcd24e60cf3e7bc204fe87c24e7e5b57:39559da1ef9f07cb608a329fc28e17d1fb8eaf3b706e18622435917b6e15c464326fff15ac5fdf8cfbd0cdace000adcf",
  mnemonicCiphertext:
    "ee56adee20e15de4826e74959ba22144:25f2f75a0cc57f895bd6d808d6df805083ce47f1843a0e1556d21a9613d9d1462f0cb539fa4a9977c95a1d0679abf33150a9c6967b9ae8f5b792f6d6c4dd1d16",
  privateKeyCiphertext:
    "3c98e84e952da3729444f929276069a7:08a3b3051bce44b831a8e42a268388345b0953f12eea3e7123c8d6c816da2e95812ee71df41bc9df07c842e6f4592a79f92464a27f9bcc94bf854c2bbc6f6aafc5d765249a7e444fc67439b57e0766df",
};

const PASSWORD = "new-format-Passw0rd!";

describe("seed wallet encryption", () => {
  it("still opens wallets written by the previous format", async () => {
    const { address, password } = LEGACY_WALLET;
    assert.equal(getEncryptionVersion(LEGACY_WALLET.privateKeyCiphertext), 1);
    assert.equal(
      await decryptData(address, LEGACY_WALLET.address_hashed, password),
      address
    );
    assert.equal(
      await decryptData(address, LEGACY_WALLET.mnemonicCiphertext, password),
      LEGACY_WALLET.mnemonic
    );
    assert.equal(
      await decryptData(address, LEGACY_WALLET.privateKeyCiphertext, password),
      LEGACY_WALLET.privateKey
    );
    await assert.rejects(
      decryptData(address, LEGACY_WALLET.privateKeyCiphertext, PASSWORD)
    );
  });

  it("encrypts new wallets in the v2 envelope", async () => {
    const { address, mnemonic, privateKey } = LEGACY_WALLET;
    const secrets = await encryptSeedWalletSecrets(
      address,
      mnemonic,
      privateKey,
      PASSWORD
    );

    for (const value of Object.values(secrets)) {
      assert.equal(getEncryptionVersion(value), 2);
      const envelope = JSON.parse(value);
      assert.equal(envelope.algorithm, "aes-256-gcm");
      assert.equal(envelope.kdf.iterations, 600000);
    }
    assert.equal(
      await decryptData(address, secrets.address_hashed, PASSWORD),
      address
    );
    assert.equal(
      await decryptData(address, secrets.mnemonic, PASSWORD),
      mnemonic
    );
    assert.equal(
      await decryptData(address, secrets.private_key, PASSWORD),
      privateKey
    );
  });

  it("keeps the no-mnemonic marker for wallets imported from a private key", async () => {
    const secrets = await encryptSeedWalletSecrets(
      LEGACY_WALLET.address,
      MNEMONIC_NA,
      LEGACY_WALLET.privateKey,
      PASSWORD
    );

    assert.equal(secrets.mnemonic, MNEMONIC_NA);
    assert.equal(getEncryptionVersion(secrets.private_key), 2);
  });

  it("gives every record its own salt, so equal passwords give unequal keys", async () => {
    const first = JSON.parse(await encryptData("same secret", PASSWORD));
    const second = JSON.parse(await encryptData("same secret", PASSWORD));

    assert.equal(first.kdf.salt.length, 32);
    assert.notEqual(first.kdf.salt, second.kdf.salt);
    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.ciphertext, second.ciphertext);
  });

  it("does not depend on the wallet address", async () => {
    const encrypted = await encryptData("secret", PASSWORD);

    assert.equal(await decryptData("", encrypted, PASSWORD), "secret");
    assert.equal(
      await decryptData(LEGACY_WALLET.address, encrypted, PASSWORD),
      "secret"
    );
  });

  it("rejects a wrong password", async () => {
    const encrypted = await encryptData("secret", PASSWORD);

    await assert.rejects(decryptData("", encrypted, "wrong-Passw0rd!"));
  });

  it("detects altered ciphertext", async () => {
    const envelope = JSON.parse(await encryptData("secret", PASSWORD));
    const flipped = (parseInt(envelope.ciphertext.slice(0, 2), 16) ^ 1)
      .toString(16)
      .padStart(2, "0");
    envelope.ciphertext = flipped + envelope.ciphertext.slice(2);

    await assert.rejects(decryptData("", JSON.stringify(envelope), PASSWORD));
  });

  it("refuses envelopes that lower the key derivation cost", async () => {
    const envelope = JSON.parse(await encryptData("secret", PASSWORD));
    envelope.kdf.iterations = 1000;
    const weakened = JSON.stringify(envelope);

    assert.equal(getEncryptionVersion(weakened), 1);
    await assert.rejects(decryptData("", weakened, PASSWORD));
  });
});
