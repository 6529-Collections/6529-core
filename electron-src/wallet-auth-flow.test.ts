import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTHENTICATION_MODAL_LAYER,
  AUTHENTICATION_MODAL_OVERLAY_CLASS,
  NON_WALLET_MODAL_LAYER,
  NON_WALLET_MODAL_OVERLAY_CLASS,
  WALLET_REQUEST_MODAL_LAYER,
  WALLET_REQUEST_MODAL_OVERLAY_CLASS,
} from "../renderer/components/shared/modal-layers";
import { SigningOperationGuard } from "../renderer/hooks/signing-operation";
import {
  createSeedWalletConnectionState,
  parseSeedWalletConnectionState,
  requireSupportedSeedWalletChainId,
} from "../renderer/wagmiConfig/seedWalletConnectionState";

describe("desktop wallet authentication flow", () => {
  it("keeps Core wallet unlock and request prompts above authentication", () => {
    assert.ok(NON_WALLET_MODAL_LAYER < AUTHENTICATION_MODAL_LAYER);
    assert.ok(AUTHENTICATION_MODAL_LAYER < WALLET_REQUEST_MODAL_LAYER);
    assert.equal(NON_WALLET_MODAL_OVERLAY_CLASS, "tw-z-[9990]");
    assert.equal(AUTHENTICATION_MODAL_OVERLAY_CLASS, "tw-z-[10000]");
    assert.equal(WALLET_REQUEST_MODAL_OVERLAY_CLASS, "tw-z-[10010]");
  });

  it("rejects malformed Core wallet addresses", () => {
    const invalidChecksumAddress = "0x52908400098527886e0F7030069857D2E4169EE7";

    assert.throws(
      () => createSeedWalletConnectionState("not-an-address", 1),
      /Invalid Core wallet address/,
    );
    assert.throws(
      () => createSeedWalletConnectionState(invalidChecksumAddress, 1),
      /Invalid Core wallet address/,
    );
    assert.equal(
      parseSeedWalletConnectionState(
        JSON.stringify({ accounts: ["not-an-address"], chainId: 1 }),
        "0x1111111111111111111111111111111111111111",
      ),
      null,
    );
  });

  it("rejects unsupported requested and persisted Core wallet chains", () => {
    const address = "0x1111111111111111111111111111111111111111";
    const unsupportedChainId = 13_337;

    assert.throws(
      () => requireSupportedSeedWalletChainId(unsupportedChainId),
      /Unsupported Core wallet chain ID/,
    );
    assert.throws(
      () => createSeedWalletConnectionState(address, unsupportedChainId),
      /Unsupported Core wallet chain ID/,
    );
    assert.equal(
      parseSeedWalletConnectionState(
        JSON.stringify({ accounts: [address], chainId: unsupportedChainId }),
        address,
      ),
      null,
    );
  });

  it("invalidates an in-flight signature before a later result can commit", () => {
    const operations = new SigningOperationGuard();
    const cancelledOperation = operations.begin();

    operations.invalidate();

    assert.equal(operations.isCurrent(cancelledOperation), false);
    const replacementOperation = operations.begin();
    assert.equal(operations.isCurrent(replacementOperation), true);
  });

  it("never lets one Core wallet connector adopt another wallet address", () => {
    const firstAddress = "0x1111111111111111111111111111111111111111";
    const secondAddress = "0x2222222222222222222222222222222222222222";
    const serializedConnection = JSON.stringify(
      createSeedWalletConnectionState(firstAddress, 1),
    );

    assert.deepEqual(
      parseSeedWalletConnectionState(serializedConnection, firstAddress),
      createSeedWalletConnectionState(firstAddress, 1),
    );
    assert.equal(
      parseSeedWalletConnectionState(serializedConnection, secondAddress),
      null,
    );
  });
});
