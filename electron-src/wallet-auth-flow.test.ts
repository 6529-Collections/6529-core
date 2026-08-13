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
  SEED_WALLET_MAINNET_CHAIN_ID,
  SEED_WALLET_SEPOLIA_CHAIN_ID,
} from "../renderer/wagmiConfig/seedWalletConnectionState";
import {
  CONNECTOR_MODAL_BODY_CLASS,
  CONNECTOR_MODAL_DIALOG_CLASS,
} from "../renderer/components/header/user/connector-modal-layout";
import {
  completeConnectorSelection,
  ConnectorSelectionGuard,
  startFreshBrowserConnectorSelection,
} from "../renderer/components/header/user/complete-connector-selection";
import { getSeedWalletSelectionState } from "../renderer/components/header/user/seed-wallet-selection-state";
import { CORE_WALLET_MODAL_SIZE_CLASS } from "../renderer/components/shared/core-wallet-modal-layout";
import {
  SEED_WALLET_REQUEST_BODY_CLASS,
  SEED_WALLET_REQUEST_DIALOG_CLASS,
  SEED_WALLET_REQUEST_FIXED_SECTION_CLASS,
} from "../renderer/components/confirm/seed-wallet-request-layout";
import {
  selectLiveWalletAccount,
} from "../renderer/components/auth/selectLiveWalletAccount";

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

  it("keeps the pure Core wallet chain contract aligned to Ethereum networks", () => {
    assert.equal(SEED_WALLET_MAINNET_CHAIN_ID, 1);
    assert.equal(SEED_WALLET_SEPOLIA_CHAIN_ID, 11_155_111);
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

  it("distinguishes active, connected, and available Core wallets", () => {
    const activeAddress = "0x1111111111111111111111111111111111111111";
    const connectedAddress = "0x2222222222222222222222222222222222222222";
    const availableAddress = "0x3333333333333333333333333333333333333333";
    const connectedAccountAddresses = [activeAddress, connectedAddress];

    assert.equal(
      getSeedWalletSelectionState({
        connectorAddress: activeAddress.toUpperCase(),
        activeAddress,
        connectedAccountAddresses,
      }),
      "active",
    );
    assert.equal(
      getSeedWalletSelectionState({
        connectorAddress: connectedAddress,
        activeAddress,
        connectedAccountAddresses,
      }),
      "connected",
    );
    assert.equal(
      getSeedWalletSelectionState({
        connectorAddress: availableAddress,
        activeAddress,
        connectedAccountAddresses,
      }),
      "available",
    );
  });

  it("makes a selected Core wallet authoritative before closing the chooser", async () => {
    const selectedAddress = "0x2222222222222222222222222222222222222222";
    const events: string[] = [];
    let resolveConnection: (() => void) | undefined;
    const connection = new Promise<void>((resolve) => {
      resolveConnection = resolve;
    });

    const selection = completeConnectorSelection({
      connect: () => connection,
      seedWalletAddress: selectedAddress,
      acceptConnection: (address) => events.push(`accept:${address}`),
      select: () => events.push("close"),
    });

    await Promise.resolve();
    assert.deepEqual(events, []);

    assert.ok(resolveConnection);
    resolveConnection();
    await selection;

    assert.deepEqual(events, [`accept:${selectedAddress}`, "close"]);
  });

  it("allows only one connector selection at a time", () => {
    const selectionGuard = new ConnectorSelectionGuard();

    assert.equal(selectionGuard.tryAcquire(), true);
    assert.equal(selectionGuard.tryAcquire(), false);

    selectionGuard.release();

    assert.equal(selectionGuard.tryAcquire(), true);
  });

  it("closes the chooser before resetting and reconnecting a browser connector", async () => {
    const events: string[] = [];
    let resolveReset: (() => void) | undefined;
    const reset = new Promise<void>((resolve) => {
      resolveReset = resolve;
    });

    const selection = startFreshBrowserConnectorSelection({
      beginHandoff: () => events.push("protect-active-profile"),
      select: () => events.push("close"),
      reset: async () => {
        events.push("reset");
        await reset;
      },
      connect: async () => {
        events.push("connect");
      },
      endHandoff: () => events.push("restore-active-profile"),
    });

    await Promise.resolve();
    assert.deepEqual(events, ["protect-active-profile", "close", "reset"]);

    assert.ok(resolveReset);
    resolveReset();
    await selection;

    assert.deepEqual(events, [
      "protect-active-profile",
      "close",
      "reset",
      "connect",
      "restore-active-profile",
    ]);
  });

  it("restores the active profile when browser reconnection fails", async () => {
    const events: string[] = [];

    await assert.rejects(
      startFreshBrowserConnectorSelection({
        beginHandoff: () => events.push("protect-active-profile"),
        select: () => events.push("close"),
        reset: async () => {
          events.push("reset");
        },
        connect: async () => {
          events.push("connect");
          throw new Error("browser connection failed");
        },
        endHandoff: () => events.push("restore-active-profile"),
      }),
      /browser connection failed/,
    );

    assert.deepEqual(events, [
      "protect-active-profile",
      "close",
      "reset",
      "connect",
      "restore-active-profile",
    ]);
  });

  it("keeps Core wallet modals in the same responsive size envelope", () => {
    assert.match(CORE_WALLET_MODAL_SIZE_CLASS, /!tw-max-w-\[40rem\]/);
    assert.match(
      CORE_WALLET_MODAL_SIZE_CLASS,
      /!tw-max-h-\[min\(78dvh,40rem\)\]/,
    );
    assert.match(CORE_WALLET_MODAL_SIZE_CLASS, /!tw-w-\[calc\(100vw-2rem\)\]/);
    assert.ok(
      CONNECTOR_MODAL_DIALOG_CLASS.includes(CORE_WALLET_MODAL_SIZE_CLASS),
    );
    assert.ok(
      SEED_WALLET_REQUEST_DIALOG_CLASS.includes(CORE_WALLET_MODAL_SIZE_CLASS),
    );
    assert.match(CONNECTOR_MODAL_BODY_CLASS, /tw-overflow-y-auto/);
    assert.doesNotMatch(SEED_WALLET_REQUEST_DIALOG_CLASS, /tw-h-\[/);
  });

  it("keeps Core wallet request actions fixed while its body scrolls", () => {
    assert.match(SEED_WALLET_REQUEST_DIALOG_CLASS, /!tw-overflow-hidden/);
    assert.match(SEED_WALLET_REQUEST_BODY_CLASS, /tw-flex-1/);
    assert.match(SEED_WALLET_REQUEST_BODY_CLASS, /tw-overflow-y-auto/);
    assert.equal(SEED_WALLET_REQUEST_FIXED_SECTION_CLASS, "tw-shrink-0");
  });

  it("keeps the active browser wallet authoritative over a stale Core connector", () => {
    const coreAddress = "0x1111111111111111111111111111111111111111";
    const browserAddress = "0x2222222222222222222222222222222222222222";

    assert.deepEqual(
      selectLiveWalletAccount({
        activeStoredAddress: browserAddress,
        browserConnectorConnectedAddress: browserAddress,
        wagmiAccount: {
          address: coreAddress,
          isConnected: true,
          status: "connected",
        },
        appKitAccount: {
          address: coreAddress,
          isConnected: true,
          status: "connected",
        },
      }),
      {
        address: browserAddress,
        isConnected: true,
        status: "connected",
      },
    );
  });

  it("does not let an inactive browser connector override the active Core wallet", () => {
    const coreAddress = "0x1111111111111111111111111111111111111111";
    const browserAddress = "0x2222222222222222222222222222222222222222";
    const coreSnapshot = {
      address: coreAddress,
      isConnected: true,
      status: "connected",
    };

    assert.equal(
      selectLiveWalletAccount({
        activeStoredAddress: coreAddress,
        browserConnectorConnectedAddress: browserAddress,
        wagmiAccount: coreSnapshot,
        appKitAccount: {},
      }),
      coreSnapshot,
    );
  });
});
