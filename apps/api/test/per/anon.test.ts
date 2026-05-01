import { describe, it, expect } from "vitest";
import { deriveAuthorAnonId } from "../../src/per/anon.js";

const seedA = "11".repeat(32);
const seedB = "22".repeat(32);

describe("deriveAuthorAnonId", () => {
  it("is deterministic for the same seed + kind", () => {
    const a = deriveAuthorAnonId(seedA, "jup_holder");
    const b = deriveAuthorAnonId(seedA, "jup_holder");
    expect(a).toBe(b);
  });

  it("differs across seeds", () => {
    const a = deriveAuthorAnonId(seedA, "jup_holder");
    const b = deriveAuthorAnonId(seedB, "jup_holder");
    expect(a).not.toBe(b);
  });

  it("differs across kinds for the same seed", () => {
    const a = deriveAuthorAnonId(seedA, "jup_holder");
    const b = deriveAuthorAnonId(seedA, "anthropic_eng");
    expect(a).not.toBe(b);
  });

  it("matches the expected shape", () => {
    expect(deriveAuthorAnonId(seedA, "jup_holder")).toMatch(/^anon_[0-9a-f]{16}$/);
  });
});
