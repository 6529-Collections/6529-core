import { readFileSync } from "node:fs";
import path from "node:path";
import { keccak256, stringToBytes } from "viem";
import {
  appGrantTimes,
  buildAppGrantTypedData,
  computeAppGrantId,
} from "@/lib/device-signing/app-grant";
import {
  canonicalizeBody,
  canonicalJson,
} from "@/lib/device-signing/canonical-json";
import { computeInterimEventId } from "@/lib/device-signing/interim-event";

/**
 * app-grant.ts requires that a wording change "must update the frontend,
 * backend and shared vectors together while preserving verification of
 * existing grants". These are those vectors, and this runs them.
 *
 * A failure here is not a stale expectation to refresh. Every id below is
 * what the backend verifies and what already-issued grants were signed
 * under, so a change that moves one invalidates grants in the wild. The
 * question to ask is whether existing grants and signatures still verify.
 *
 * The vectors live in shared/ as plain JSON on purpose: they are the
 * contract a second implementation checks itself against, in any language.
 */
const vectors = JSON.parse(
  readFileSync(
    path.join(__dirname, "../../shared/device-signing/vectors.json"),
    "utf8"
  )
);

describe("device signing vectors", () => {
  it("canonicalises JSON exactly", () => {
    for (const v of vectors.canonicalJson) {
      expect([v.name, canonicalJson(v.input)]).toEqual([v.name, v.canonical]);
    }
  });

  it("hashes a body, and never lets a signature cover itself", () => {
    for (const v of vectors.body) {
      const { bodyHash, bodySize } = canonicalizeBody(v.input);
      expect([v.name, bodyHash, bodySize]).toEqual([
        v.name,
        v.bodyHash,
        v.bodySize,
      ]);
    }
  });

  it("computes interim event ids", () => {
    for (const v of vectors.event) {
      expect([v.name, computeInterimEventId(v.fields)]).toEqual([
        v.name,
        v.eventId,
      ]);
    }
  });

  it("renders the signed statement and the grant id", () => {
    for (const v of vectors.grant) {
      const typed = buildAppGrantTypedData(v.fields);
      if (v.statement !== undefined) {
        expect([v.name, typed.message.statement]).toEqual([
          v.name,
          v.statement,
        ]);
      }
      expect([v.name, typed.domain]).toEqual([v.name, v.domain]);
      expect([v.name, computeAppGrantId(typed.message as never)]).toEqual([
        v.name,
        v.grantId,
      ]);
    }
  });

  it("aligns grant expiry to the minute", () => {
    for (const v of vectors.times) {
      const t = appGrantTimes(v.issuedAtMs);
      expect([v.name, t.issuedAtSeconds, t.expiresAtSeconds]).toEqual([
        v.name,
        v.issuedAtSeconds,
        v.expiresAtSeconds,
      ]);
      expect(t.expiresAtSeconds % 60).toBe(0);
    }
  });

  it("derives the shared salt from its preimage", () => {
    expect(keccak256(stringToBytes(vectors.salt.preimage))).toBe(
      vectors.salt.keccak256
    );
  });
});
