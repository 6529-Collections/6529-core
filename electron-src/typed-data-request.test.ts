import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Wallet, verifyTypedData } from "ethers";
import { signSeedWalletTypedData } from "../renderer/wagmiConfig/seedWalletTypedData";
import {
  getTypedDataRequestAddress,
  parseTypedDataRequest,
} from "../renderer/wagmiConfig/typedDataRequest";

// Hardhat's public test key #0; never a real wallet.
const TEST_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

// Shaped like the app device grant: a salted domain and one root type.
const domain = {
  name: "6529 Device Grant",
  version: "1",
  salt: "0x4887f15a22b96f574a9f835b87e01e293dc7587acbfc13b5f224b89cd2d8c8aa",
};
const types = {
  DeviceGrant: [
    { name: "statement", type: "string" },
    { name: "wallet", type: "address" },
    { name: "deviceKey", type: "bytes32" },
    { name: "ciphersuite", type: "uint16" },
    { name: "issuedAt", type: "uint64" },
    { name: "origin", type: "string" },
  ],
};

function request(wallet: { readonly address: string }, primaryType = "DeviceGrant") {
  const message = {
    statement: "Turn on signed and encrypted messages on this device.",
    wallet: wallet.address.toLowerCase(),
    deviceKey: `0x${"ab".repeat(32)}`,
    ciphersuite: 1,
    issuedAt: "1793520000",
    origin: "6529 Desktop",
  };
  // As viem sends it: the domain type is included and the data is JSON.
  return {
    message,
    params: [
      wallet.address,
      JSON.stringify({
        domain,
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "salt", type: "bytes32" },
          ],
          ...types,
        },
        primaryType,
        message,
      }),
    ],
  };
}

describe("desktop wallet typed-data requests", () => {
  it("parses eth_signTypedData_v4 params without the domain type", () => {
    const wallet = new Wallet(TEST_KEY);
    const parsed = parseTypedDataRequest(request(wallet).params);
    assert.equal(parsed.address, wallet.address.toLowerCase());
    assert.equal(parsed.primaryType, "DeviceGrant");
    assert.deepEqual(Object.keys(parsed.types), ["DeviceGrant"]);
    assert.equal(getTypedDataRequestAddress(request(wallet).params), parsed.address);
  });

  it("rejects malformed requests", () => {
    assert.throws(() => parseTypedDataRequest([]), /no valid address/);
    assert.throws(
      () => parseTypedDataRequest(["0x" + "1".repeat(40), "{not json"]),
      /not valid JSON/,
    );
    assert.throws(
      () =>
        parseTypedDataRequest([
          "0x" + "1".repeat(40),
          JSON.stringify({ domain, types, primaryType: "Missing", message: {} }),
        ]),
      /no Missing type/,
    );
    assert.equal(getTypedDataRequestAddress(["not-an-address"]), null);
  });

  it("signs a Core wallet's typed data so the grant verifies", async () => {
    const wallet = new Wallet(TEST_KEY);
    const { params, message } = request(wallet);
    const signature = await signSeedWalletTypedData(wallet, params);
    assert.equal(
      verifyTypedData(domain, types, message, signature),
      wallet.address,
    );
  });

  it("refuses typed data for another wallet or another primary type", async () => {
    const wallet = new Wallet(TEST_KEY);
    const other = Wallet.createRandom();
    await assert.rejects(
      signSeedWalletTypedData(wallet, request(other).params),
      /another wallet/,
    );
    const withExtraRoot = JSON.parse(request(wallet).params[1] as string);
    withExtraRoot.types.Other = [{ name: "x", type: "string" }];
    await assert.rejects(
      signSeedWalletTypedData(wallet, [wallet.address, JSON.stringify(withExtraRoot)]),
    );
  });
});
