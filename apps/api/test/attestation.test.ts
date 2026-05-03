import { describe, it, expect } from "vitest";
import bs58 from "bs58";
import nacl from "tweetnacl";
import {
  AttestationError,
  canonicalMessage,
  sha256Hex,
  signAttestationForDev,
  verifyAttestation,
} from "../src/attestation.js";

function freshKeypair() {
  const kp = nacl.sign.keyPair();
  return {
    publicKeyB58: bs58.encode(kp.publicKey),
    secret: kp.secretKey,
  };
}

describe("attestation", () => {
  it("verifies a freshly-signed attestation", () => {
    const { publicKeyB58, secret } = freshKeypair();
    const now = 1_700_000_000;
    const att = signAttestationForDev(
      {
        action: "post",
        anonId: "anon_abc",
        badgeKind: "jup_holder",
        resourceId: "post-1",
        contentHash: sha256Hex("hello world"),
        issuedAt: now,
      },
      secret,
    );

    expect(() => verifyAttestation(att, { perPubkeyBase58: publicKeyB58, now: () => now + 30 })).not.toThrow();
  });

  it("rejects an expired attestation", () => {
    const { publicKeyB58, secret } = freshKeypair();
    const att = signAttestationForDev(
      {
        action: "post",
        anonId: "anon_abc",
        badgeKind: "jup_holder",
        resourceId: "post-1",
        contentHash: sha256Hex("x"),
        issuedAt: 1_700_000_000,
      },
      secret,
    );

    expect(() =>
      verifyAttestation(att, { perPubkeyBase58: publicKeyB58, now: () => 1_700_000_000 + 1000 }),
    ).toThrow(AttestationError);
  });

  it("rejects a tampered content hash", () => {
    const { publicKeyB58, secret } = freshKeypair();
    const now = 1_700_000_000;
    const att = signAttestationForDev(
      {
        action: "post",
        anonId: "anon_abc",
        badgeKind: "jup_holder",
        resourceId: "post-1",
        contentHash: sha256Hex("original"),
        issuedAt: now,
      },
      secret,
    );

    const tampered = { ...att, contentHash: sha256Hex("evil rewrite") };
    expect(() =>
      verifyAttestation(tampered, { perPubkeyBase58: publicKeyB58, now: () => now + 5 }),
    ).toThrow(AttestationError);
  });

  it("rejects a signature signed by a different key", () => {
    const honest = freshKeypair();
    const attacker = freshKeypair();
    const now = 1_700_000_000;
    const att = signAttestationForDev(
      {
        action: "post",
        anonId: "anon_abc",
        badgeKind: "jup_holder",
        resourceId: "post-1",
        contentHash: sha256Hex("ok"),
        issuedAt: now,
      },
      attacker.secret,
    );

    expect(() => verifyAttestation(att, { perPubkeyBase58: honest.publicKeyB58, now: () => now + 5 })).toThrow(
      AttestationError,
    );
  });

  it("canonical message is deterministic in field order", () => {
    const m = canonicalMessage({
      action: "comment",
      anonId: "anon_x",
      badgeKind: "bonk_holder",
      resourceId: "post-7",
      contentHash: "h",
      issuedAt: 42,
    });
    expect(m).toBe("comment|anon_x|bonk_holder|post-7|h|42");
  });
});
