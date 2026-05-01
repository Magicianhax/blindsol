import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  BadgeTokenError,
  newAnonSeed,
  signBadgeToken,
  verifyBadgeToken,
  walletFingerprint,
  type BadgeTokenPayload,
} from "../../src/per/token.js";

function freshKeypair() {
  const kp = nacl.sign.keyPair();
  return { pub: bs58.encode(kp.publicKey), secret: kp.secretKey };
}

function basePayload(now: number, overrides: Partial<BadgeTokenPayload> = {}): BadgeTokenPayload {
  return {
    badgeId: "badge-1",
    kind: "jup_holder",
    anonSeed: newAnonSeed(),
    walletFingerprint: walletFingerprint("CrZ123Pubkey"),
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

describe("BadgeToken", () => {
  it("round-trips sign → verify", () => {
    const { pub, secret } = freshKeypair();
    const now = 1_700_000_000;
    const payload = basePayload(now);
    const token = signBadgeToken(payload, secret);
    const out = verifyBadgeToken(token, pub, () => now + 60);
    expect(out.badgeId).toBe(payload.badgeId);
    expect(out.kind).toBe(payload.kind);
    expect(out.anonSeed).toBe(payload.anonSeed);
  });

  it("rejects expired tokens", () => {
    const { pub, secret } = freshKeypair();
    const token = signBadgeToken(basePayload(1_700_000_000), secret);
    expect(() => verifyBadgeToken(token, pub, () => 1_700_000_000 + 4000)).toThrow(BadgeTokenError);
  });

  it("rejects tokens issued in the future (clock skew guard)", () => {
    const { pub, secret } = freshKeypair();
    const token = signBadgeToken(basePayload(1_700_000_000), secret);
    expect(() => verifyBadgeToken(token, pub, () => 1_700_000_000 - 600)).toThrow(BadgeTokenError);
  });

  it("rejects tokens signed by a different key", () => {
    const { secret } = freshKeypair();
    const { pub: otherPub } = freshKeypair();
    const token = signBadgeToken(basePayload(1_700_000_000), secret);
    expect(() => verifyBadgeToken(token, otherPub, () => 1_700_000_000 + 60)).toThrow(BadgeTokenError);
  });

  it("rejects tampered payloads", () => {
    const { pub, secret } = freshKeypair();
    const token = signBadgeToken(basePayload(1_700_000_000), secret);
    const parts = token.split(".");
    // flip last char of payload
    const evilPayload = parts[1]!.slice(0, -1) + (parts[1]!.endsWith("a") ? "b" : "a");
    const tampered = `${parts[0]}.${evilPayload}.${parts[2]}`;
    expect(() => verifyBadgeToken(tampered, pub, () => 1_700_000_000 + 60)).toThrow(BadgeTokenError);
  });

  it("rejects malformed tokens", () => {
    const { pub } = freshKeypair();
    expect(() => verifyBadgeToken("not-a-token", pub)).toThrow(BadgeTokenError);
    expect(() => verifyBadgeToken("blindsol-bt-v1.foo", pub)).toThrow(BadgeTokenError);
    expect(() => verifyBadgeToken("blindsol-bt-v9.x.y", pub)).toThrow(BadgeTokenError);
  });

  it("walletFingerprint is deterministic and 64 hex chars", () => {
    const a = walletFingerprint("ABC");
    const b = walletFingerprint("ABC");
    const c = walletFingerprint("XYZ");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("newAnonSeed returns a 64-hex-char string", () => {
    const s = newAnonSeed();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
  });
});
