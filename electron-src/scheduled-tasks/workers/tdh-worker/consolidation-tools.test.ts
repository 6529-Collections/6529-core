import assert from "node:assert/strict";
import { describe, it } from "node:test";
const cutoff = Date.parse("2026-10-15T00:00:00Z") / 1000;
import { consolidationTools, ConsolidationLink } from "./consolidation-tools";

const wallets = ["a", "b", "c", "d", "e"];
function mesh(freshMember?: string): ConsolidationLink[] {
  return wallets.slice(0, 4).flatMap((wallet1, i) =>
    wallets.slice(i + 1, 4).map((wallet2) => ({
      wallet1,
      wallet2,
      block: 100,
      wallet1_registered_at: [wallet1, wallet2].includes(freshMember!)
        ? cutoff
        : cutoff - 1,
      wallet2_registered_at: [wallet1, wallet2].includes(freshMember!)
        ? cutoff
        : cutoff - 1,
    })),
  );
}
const groups = (links: ConsolidationLink[]) =>
  consolidationTools
    .extractConsolidations(links, cutoff)
    .map((group) => group.slice().sort().join(""))
    .sort();

describe("native grouping parity with backend #2148", () => {
  it("keeps legacy triples but never activates an old mesh by calendar time", () => {
    assert.deepEqual(groups(mesh()), ["abc", "d"]);
    assert.deepEqual(
      groups(
        mesh().map((link) => ({
          ...link,
          wallet1_registered_at: null,
          wallet2_registered_at: null,
        })),
      ),
      ["abc", "d"],
    );
    assert.deepEqual(groups(mesh().slice(0, 2)), ["ab", "c"]);
  });
  it("allows any member's six directions to activate the four-wallet mesh, inclusive", () => {
    for (const member of wallets.slice(0, 4))
      assert.deepEqual(groups(mesh(member)), ["abcd"]);
    const missingDirection = mesh("d");
    missingDirection[2].wallet1_registered_at = null;
    assert.deepEqual(groups(missingDirection), ["abc", "d"]);
    missingDirection[2].wallet1_registered_at = cutoff - 1;
    assert.deepEqual(groups(missingDirection), ["abc", "d"]);
  });
  it("replaces old ABC with ABD when newest AD/BD exist and CD is missing", () => {
    const links = mesh("d").filter(
      (link) => !(link.wallet1 === "c" && link.wallet2 === "d"),
    );
    links.forEach((link) => {
      link.block = link.wallet2 === "d" ? 200 : 100;
    });
    assert.deepEqual(groups(links), ["abd", "c"]);
  });
  it("uses deterministic pair-key ties and gives every wallet one group", () => {
    const links = mesh("d");
    assert.deepEqual(groups(links), groups(links.slice().reverse()));
    links.push({
      wallet1: "d",
      wallet2: "e",
      block: 300,
      wallet1_registered_at: cutoff,
      wallet2_registered_at: cutoff,
    });
    const result = consolidationTools.extractConsolidations(links, cutoff);
    const flattened = result.flat();
    assert.equal(new Set(flattened).size, flattened.length);
    assert.equal(flattened.length, 5);
    assert.ok(result.every((group) => group.length <= 4));
  });
});

it("preserves the caller's link order while producing deterministic groups", () => {
  const links = mesh("d").reverse();
  const original = links.slice();
  assert.deepEqual(groups(links), ["abcd"]);
  assert.deepEqual(links, original);
});

it("applies different environment cutoffs to the same on-chain links", () => {
  const staging = Date.parse("2026-10-12T00:00:00Z") / 1000;
  const links = mesh("d").map((link) => ({
    ...link,
    wallet1_registered_at: staging,
    wallet2_registered_at: staging,
  }));
  assert.ok(
    consolidationTools
      .extractConsolidations(links, staging)
      .some((group) => group.length === 4),
  );
  assert.ok(
    consolidationTools
      .extractConsolidations(links, cutoff)
      .every((group) => group.length <= 3),
  );
});
