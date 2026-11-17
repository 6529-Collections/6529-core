import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBrowserWalletReturnLink,
  decodeBrowserWalletMessage,
  describeBrowserWalletRequest,
  parseBrowserWalletClaimResponse,
  readBrowserWalletRequestId,
} from "../renderer/components/browser-connector/browserWalletRequest.helpers";

const address = `0x${"11".repeat(20)}`;
const hex = (text: string) => `0x${Buffer.from(text, "utf8").toString("hex")}`;

describe("browser connector page request handling", () => {
  it("reads the request id only from the fragment's request key", () => {
    const id = "a".repeat(43);
    assert.equal(readBrowserWalletRequestId(`#request=${id}`), id);
    for (const hash of ["", "#", `#requestId=${id}`, "#request=short", `#request=${id}!`]) {
      assert.equal(readBrowserWalletRequestId(hash), null, hash);
    }
  });

  it("shows message text exactly and flags unreadable or hidden characters", () => {
    assert.equal(decodeBrowserWalletMessage(hex("line 1\nline 2")), "line 1\nline 2");
    assert.equal(decodeBrowserWalletMessage("0xff00"), null);
    assert.equal(decodeBrowserWalletMessage(hex("pay ‮bob")), null);
    assert.equal(decodeBrowserWalletMessage(hex("a\u0000b")), null);
    const raw = describeBrowserWalletRequest({
      method: "personal_sign",
      address,
      chainId: 1,
      message: "0xff00",
    });
    assert.equal(raw.rows[0]?.value, "0xff00");
    assert.equal(raw.warnings.length, 1);
    assert.equal(raw.requiredChainId, null);
  });

  it("describes typed data by type, domain and fields and requires its network", () => {
    const description = describeBrowserWalletRequest({
      method: "eth_signTypedData_v4",
      address,
      chainId: 1,
      typedDataChainId: 11155111,
      typedData: JSON.stringify({
        domain: { name: "6529 Device Grant", version: "2", chainId: 11155111 },
        types: { Grant: [{ name: "statement", type: "string" }] },
        primaryType: "Grant",
        message: { statement: "Turn on signed messages", ciphersuites: [78] },
      }),
    });
    const rows = Object.fromEntries(description.rows.map((row) => [row.label, row.value]));
    assert.equal(rows["Type"], "Grant");
    assert.equal(rows["App"], "6529 Device Grant");
    assert.equal(rows["Network"], "Sepolia (test network)");
    assert.equal(rows["statement"], "Turn on signed messages");
    assert.match(rows["ciphersuites"] ?? "", /78/);
    assert.equal(description.requiredChainId, 11155111);
  });

  it("refuses app answers that do not match the request formats", () => {
    const good = {
      request: { method: "personal_sign", address, chainId: 1, message: "0x68" },
      returnToken: "t".repeat(43),
      expiresInMs: 1000,
    };
    assert.ok(parseBrowserWalletClaimResponse(good));
    for (const bad of [
      { ...good, request: { ...good.request, method: "eth_sign" } },
      { ...good, request: { ...good.request, address: "0x12" } },
      { ...good, returnToken: "short" },
      { ...good, expiresInMs: 0 },
      {
        ...good,
        request: {
          method: "eth_sendTransaction",
          address,
          chainId: 1,
          transaction: { from: `0x${"22".repeat(20)}`, to: address, value: "0x0", data: "0x" },
        },
      },
      null,
    ]) {
      assert.equal(parseBrowserWalletClaimResponse(bad), null, JSON.stringify(bad));
    }
  });

  it("returns the outcome with the request id and return token only", () => {
    const link = buildBrowserWalletReturnLink("classiccore6529", "i".repeat(43), "t".repeat(43), {
      error: "cancelled",
    });
    const data = JSON.parse(new URL(link).searchParams.get("data") ?? "null");
    assert.deepEqual(data, { v: 2, id: "i".repeat(43), token: "t".repeat(43), error: "cancelled" });
  });
});
