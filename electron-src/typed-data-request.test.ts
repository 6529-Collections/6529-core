import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TypedDataEncoder,
  Wallet,
  verifyTypedData,
  type TypedDataDomain,
} from "ethers";
import { signSeedWalletTypedData } from "../renderer/wagmiConfig/seedWalletTypedData";
import {
  describeTypedDataField,
  formatTypedDataValue,
} from "../renderer/wagmiConfig/typedDataDisplay";
import { assertTypedDataRoot } from "../renderer/wagmiConfig/typedDataRoot";
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

function request(
  wallet: { readonly address: string },
  primaryType = "DeviceGrant",
) {
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
    assert.equal(
      getTypedDataRequestAddress(request(wallet).params),
      parsed.address,
    );
  });

  it("rejects malformed requests", () => {
    const wallet = new Wallet(TEST_KEY);
    assert.throws(() => parseTypedDataRequest([]), /no valid address/);
    assert.throws(
      () => parseTypedDataRequest(["0x" + "1".repeat(40), "{not json"]),
      /not valid JSON/,
    );
    assert.throws(
      () =>
        parseTypedDataRequest([
          "0x" + "1".repeat(40),
          JSON.stringify({
            domain,
            types,
            primaryType: "Missing",
            message: {},
          }),
        ]),
      /no Missing type/,
    );
    assert.equal(getTypedDataRequestAddress(["not-an-address"]), null);
    for (const primaryType of ["toString", "__proto__", "constructor"]) {
      assert.throws(
        () =>
          parseTypedDataRequest([
            wallet.address,
            JSON.stringify({ domain, types, primaryType, message: {} }),
          ]),
        /no .* type/,
      );
    }
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

  it("the shared wallet guard rejects unrelated roots and a non-root primary type", () => {
    const wallet = new Wallet(TEST_KEY);
    const parsed = parseTypedDataRequest(request(wallet).params);
    assert.doesNotThrow(() => assertTypedDataRoot(parsed));
    assert.throws(() =>
      assertTypedDataRoot({
        ...parsed,
        types: { ...parsed.types, Other: [{ name: "x", type: "string" }] },
      }),
    );
    assert.throws(
      () =>
        assertTypedDataRoot({
          ...parsed,
          types: {
            ...parsed.types,
            Outer: [{ name: "grant", type: "DeviceGrant" }],
          },
        }),
      /not the root type/,
    );
  });

  it("reports recoverable errors for cyclic and multiple-root schemas", () => {
    const parsed = parseTypedDataRequest(request(new Wallet(TEST_KEY)).params);
    for (const invalidTypes of [
      { A: [{ name: "b", type: "B" }], B: [{ name: "a", type: "A" }] },
      {
        A: [{ name: "x", type: "string" }],
        B: [{ name: "y", type: "string" }],
      },
    ]) {
      assert.throws(
        () => assertTypedDataRoot({ ...parsed, types: invalidTypes }),
        /^Error: Invalid typed data request\. Ask the requester to send a valid request\.$/,
      );
    }
  });

  it("rejects invalid or imprecise domain chain IDs", () => {
    const base = JSON.parse(request(new Wallet(TEST_KEY)).params[1] as string);
    for (const chainId of [
      null,
      true,
      {},
      "",
      "1.1",
      "-1",
      "0xno",
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      (2n ** 256n).toString(),
    ]) {
      assert.throws(
        () =>
          parseTypedDataRequest([
            new Wallet(TEST_KEY).address,
            { ...base, domain: { ...domain, chainId } },
          ]),
        /Invalid typed data chain ID/,
      );
    }
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
      signSeedWalletTypedData(wallet, [
        wallet.address,
        JSON.stringify(withExtraRoot),
      ]),
    );
  });
});

// Grant v2 (D172): `uint16[] ciphersuites` and domain version "2". The ids
// (EIP-712 digests) and signatures are the shared vectors pinned by the
// frontend (__tests__/lib/device-signing/app-grant.test.ts and
// __tests__/lib/e2ee/grant.test.ts) and the backend (app-device-grant-v2.test.ts
// and e2ee-grant-v2.test.ts). Hardhat's public test keys #0 and #1.
const GRANT_SALT =
  "0x4887f15a22b96f574a9f835b87e01e293dc7587acbfc13b5f224b89cd2d8c8aa";
const V2_DEVICE_KEY =
  "0xd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const V2_MLS_KEY =
  "0x3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c";
const SALTED_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "salt", type: "bytes32" },
];
const APP_GRANT_V2_TYPES = {
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
};
const MLS_GRANT_V2_TYPES = {
  MlsDeviceGrant: [
    { name: "statement", type: "string" },
    { name: "wallet", type: "address" },
    { name: "deviceKey", type: "bytes32" },
    { name: "ciphersuites", type: "uint16[]" },
    { name: "issuedAt", type: "uint64" },
    { name: "expiresAt", type: "uint64" },
    { name: "origin", type: "string" },
  ],
};
const SIGNING_STATEMENT =
  "Turn on signed messages on this device until 16 Apr 2027. This device will sign your posts, edits, deletes and reactions so anyone can verify they came from your wallet. It can't move funds, change your handle, add devices or act as an admin. No transaction, no gas, no token approvals. (Device key d75a9801...f707511a)";
const COMBINED_STATEMENT =
  "Turn on signed messages on this device until 16 Apr 2027. This device will sign your posts, edits, deletes and reactions so anyone can verify they came from your wallet. It will also encrypt (send) and decrypt (read) your end-to-end encrypted messages, which 6529.io cannot read. It can't move funds, change your handle, add devices or act as an admin. No transaction, no gas, no token approvals. (Device key d75a9801...f707511a, encrypted messages key 3d4017c3...2af4660c)";
const MLS_STATEMENT =
  "Let this device send and read end-to-end encrypted messages as you until 2026-04-10 12:00 UTC (device key d75a9801...f707511a). 6529 cannot read these messages. This signature cannot move funds, change your handle or act as an admin, and it does not create a blockchain transaction or cost gas.";

// The frontend builds uint64 fields as bigints; viem's JSON-RPC encoding sends
// them as decimal strings. Suites stay numbers.
const appGrantV2 = (
  statement: string,
  mlsDeviceKey: string,
  ciphersuites: number[],
) => ({
  statement,
  wallet: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  deviceKey: V2_DEVICE_KEY,
  scopes: "post,edit,delete,react",
  mlsDeviceKey,
  ciphersuites,
  issuedAt: "1792324800",
  expiresAt: "1807876800",
  origin: "6529 Desktop",
});

const V2_VECTORS = [
  {
    label: "app DeviceGrant v2, signing only",
    key: TEST_KEY,
    domain: { name: "6529 Device Grant", version: "2", salt: GRANT_SALT },
    types: APP_GRANT_V2_TYPES,
    primaryType: "DeviceGrant",
    message: appGrantV2(SIGNING_STATEMENT, `0x${"0".repeat(64)}`, []),
    id: "0x9c049140e722cb25940749c8b9ba5167b4fa79c56d97aad08a3fa8bf9d98d29f",
    signature:
      "0xd63015f9778f55b14b90f9aefc091394a5e2a5c2e934d1f3d14ab0a029ea86390f299641867af17663b26ce4d367e2265ce78f1e226dd1edfce984fd6d34b2eb1c",
  },
  {
    label: "app DeviceGrant v2, combined with encrypted messages",
    key: TEST_KEY,
    domain: { name: "6529 Device Grant", version: "2", salt: GRANT_SALT },
    types: APP_GRANT_V2_TYPES,
    primaryType: "DeviceGrant",
    message: appGrantV2(COMBINED_STATEMENT, V2_MLS_KEY, [78]),
    id: "0x512beaf4b8e41c4e3ed31526432e8c8ec44215f2157244750c8395b1bb06acb3",
    signature:
      "0xd48f0e4508c1c479fd8c746c7f1db8324a11daf65069ca1e71b849f6951770837abb735d30bffe543153fff9591be95ab2a8731e3b580be8dd113a5d51211e811c",
  },
  {
    label: "MlsDeviceGrant v2",
    key: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    domain: { name: "6529 Encrypted Messages", version: "2", salt: GRANT_SALT },
    types: MLS_GRANT_V2_TYPES,
    primaryType: "MlsDeviceGrant",
    message: {
      statement: MLS_STATEMENT,
      wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      deviceKey: V2_DEVICE_KEY,
      ciphersuites: [78],
      issuedAt: "1760270400",
      expiresAt: "1775822400",
      origin: "staging.6529.io",
    },
    id: "0x644ebe12cda087010bf3e47ed0d4d495867f9b5add5247156cc6e7f0cb7b2a88",
    signature:
      "0x130adfb724a264fed9bebd65c0a4e379fb18f86f1a8239874fb2c68e7a2d3b5d66004f3537b6a8a516eca4476e8c38450a74fb0b714fe6b1619e8382bb8b8b1f1c",
  },
];

describe("desktop wallet typed-data requests for v2 grants (D172)", () => {
  for (const vector of V2_VECTORS) {
    it(`signs the shared ${vector.label} vector byte for byte`, async () => {
      const wallet = new Wallet(vector.key);
      // As viem sends it: the domain type is included and the data is JSON.
      const params = [
        wallet.address,
        JSON.stringify({
          domain: vector.domain,
          types: { EIP712Domain: SALTED_DOMAIN_TYPE, ...vector.types },
          primaryType: vector.primaryType,
          message: vector.message,
        }),
      ];
      const parsed = parseTypedDataRequest(params);
      // The uint16[] field type and the suite array pass through unchanged.
      assert.deepEqual({ ...parsed.types }, vector.types);
      assert.deepEqual(parsed.domain, vector.domain);
      assert.deepEqual(parsed.message, vector.message);
      assert.doesNotThrow(() => assertTypedDataRoot(parsed));
      assert.equal(
        TypedDataEncoder.hash(
          parsed.domain as TypedDataDomain,
          parsed.types,
          parsed.message,
        ),
        vector.id,
      );
      const signature = await signSeedWalletTypedData(wallet, params);
      assert.equal(signature, vector.signature);
      assert.equal(
        verifyTypedData(vector.domain, vector.types, vector.message, signature),
        wallet.address,
      );
    });
  }

  it("labels grant suites readably in the Core wallet confirmation", () => {
    assert.equal(
      describeTypedDataField("DeviceGrant", "ciphersuites", [78]),
      "MLS 0x004E, AES-256",
    );
    assert.equal(
      describeTypedDataField("MlsDeviceGrant", "ciphersuites", [78, 79]),
      "MLS 0x004E, AES-256; MLS 0x004F, AES-128",
    );
    assert.equal(
      describeTypedDataField("DeviceGrant", "ciphersuites", []),
      "no encrypted messages",
    );
    // v1 grants signed one suite; 0 meant signing only.
    assert.equal(
      describeTypedDataField("MlsDeviceGrant", "ciphersuite", 79),
      "MLS 0x004F, AES-128",
    );
    assert.equal(
      describeTypedDataField("DeviceGrant", "ciphersuite", 0),
      "no encrypted messages",
    );
    assert.equal(
      describeTypedDataField("DeviceGrant", "ciphersuites", [4660]),
      "MLS 0x1234",
    );
    const unlabelled: Array<[string, string, unknown]> = [
      ["Permit", "ciphersuites", [78]],
      ["DeviceGrant", "scopes", "post"],
      ["DeviceGrant", "ciphersuites", ["78"]],
      ["DeviceGrant", "ciphersuites", [70000]],
      ["DeviceGrant", "ciphersuite", 1.5],
    ];
    for (const [primaryType, field, value] of unlabelled) {
      assert.equal(describeTypedDataField(primaryType, field, value), null);
    }
    // The raw signed value stays visible next to the note.
    assert.equal(formatTypedDataValue([78]), "[78]");
    assert.equal(formatTypedDataValue("6529 Desktop"), "6529 Desktop");
  });

  it("shows a normalized domain chain ID instead of failing to serialize it", () => {
    const wallet = new Wallet(TEST_KEY);
    const parsed = parseTypedDataRequest([
      wallet.address,
      JSON.stringify({
        domain: { ...domain, chainId: "0x1" },
        types,
        primaryType: "DeviceGrant",
        message: request(wallet).message,
      }),
    ]);
    assert.equal(typeof parsed.domain["chainId"], "bigint");
    assert.equal(formatTypedDataValue(parsed.domain["chainId"]), "1");
  });
});
