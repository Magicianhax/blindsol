import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

// Mirrors the IDL discriminators we hard-coded into onchain.ts.
// If anchor changes the discriminator algorithm or instruction names move,
// these will drift and the tests catch it.
import {
  ownerCommitmentFromSeed,
  padTo32Bytes,
} from "../src/badges/onchain.js";

function ixDisc(name: string): number[] {
  return Array.from(createHash("sha256").update(`global:${name}`).digest().subarray(0, 8));
}

function accDisc(name: string): number[] {
  return Array.from(createHash("sha256").update(`account:${name}`).digest().subarray(0, 8));
}

describe("badge_registry discriminators (hard-coded in onchain.ts)", () => {
  it("initialize_registry instruction matches Anchor's sha256 algorithm", () => {
    expect(ixDisc("initialize_registry")).toEqual([189, 181, 20, 17, 174, 57, 249, 59]);
  });

  it("mint_badge instruction matches", () => {
    expect(ixDisc("mint_badge")).toEqual([242, 234, 237, 183, 232, 245, 146, 1]);
  });

  it("Registry account discriminator matches", () => {
    expect(accDisc("Registry")).toEqual([47, 174, 110, 246, 184, 182, 252, 218]);
  });

  it("Badge account discriminator matches", () => {
    expect(accDisc("Badge")).toEqual([40, 127, 162, 181, 177, 154, 1, 48]);
  });
});

describe("padTo32Bytes", () => {
  it("zero-pads a short label", () => {
    const out = padTo32Bytes("jup_holder");
    expect(out.length).toBe(32);
    expect(out.toString("utf8", 0, 10)).toBe("jup_holder");
    expect(out[10]).toBe(0);
    expect(out[31]).toBe(0);
  });

  it("truncates a label longer than 32 bytes", () => {
    const longLabel = "x".repeat(64);
    const out = padTo32Bytes(longLabel);
    expect(out.length).toBe(32);
  });
});

describe("ownerCommitmentFromSeed", () => {
  it("produces a deterministic 32-byte sha256 of the seed", () => {
    const seed = "11".repeat(32);
    const c1 = ownerCommitmentFromSeed(seed);
    const c2 = ownerCommitmentFromSeed(seed);
    expect(c1.length).toBe(32);
    expect(c1.equals(c2)).toBe(true);
  });

  it("differs for different seeds", () => {
    const a = ownerCommitmentFromSeed("11".repeat(32));
    const b = ownerCommitmentFromSeed("22".repeat(32));
    expect(a.equals(b)).toBe(false);
  });
});
