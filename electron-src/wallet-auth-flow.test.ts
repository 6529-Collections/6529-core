import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTHENTICATION_MODAL_LAYER,
  AUTHENTICATION_MODAL_OVERLAY_CLASS,
  WALLET_REQUEST_MODAL_LAYER,
  WALLET_REQUEST_MODAL_OVERLAY_CLASS,
} from "../renderer/components/shared/modal-layers";
import { SigningOperationGuard } from "../renderer/hooks/signing-operation";
import {
  createSeedWalletConnectionState,
  parseSeedWalletConnectionState,
} from "../renderer/wagmiConfig/seedWalletConnectionState";

describe("desktop wallet authentication flow", () => {
  it("keeps Core wallet unlock and request prompts above authentication", () => {
    assert.ok(AUTHENTICATION_MODAL_LAYER < WALLET_REQUEST_MODAL_LAYER);
    assert.equal(AUTHENTICATION_MODAL_OVERLAY_CLASS, "tw-z-[10000]");
    assert.equal(WALLET_REQUEST_MODAL_OVERLAY_CLASS, "tw-z-[10010]");
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
