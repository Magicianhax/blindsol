import bs58 from "bs58";
import nacl from "tweetnacl";
import { createHash } from "node:crypto";

/**
 * The TEE-side attestation we accept on every write request.
 *
 * The PER, after verifying the user owns a valid badge and computing
 * `author_anon_id = HMAC(per_secret, wallet || badge_kind || session)`,
 * signs the canonical message with its long-lived signing key and we
 * verify the signature with the public key configured at startup.
 *
 * In dev, we run our own signer (DEV_KEYPAIR_SECRET); in prod, the
 * pubkey points at MagicBlock's PER attestation key.
 */
export interface Attestation {
  readonly action: "post" | "comment" | "reaction";
  readonly anonId: string;
  readonly badgeKind: string;
  readonly resourceId: string; // post_id (for post), comment_id (for comment), post_id+kind (for reaction)
  readonly contentHash: string; // sha256 hex of body (or "" for reactions)
  readonly issuedAt: number; // unix seconds
  readonly signature: string; // base58 ed25519 signature over canonical message
}

const MAX_AGE_SECONDS = 5 * 60;

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function canonicalMessage(a: Omit<Attestation, "signature">): string {
  return [a.action, a.anonId, a.badgeKind, a.resourceId, a.contentHash, a.issuedAt].join("|");
}

export interface VerifyConfig {
  perPubkeyBase58: string;
  now?: () => number;
}

export class AttestationError extends Error {
  constructor(public readonly reason: string) {
    super(`Attestation rejected: ${reason}`);
    this.name = "AttestationError";
  }
}

export function verifyAttestation(att: Attestation, cfg: VerifyConfig): void {
  const now = (cfg.now ?? (() => Math.floor(Date.now() / 1000)))();
  if (Math.abs(now - att.issuedAt) > MAX_AGE_SECONDS) {
    throw new AttestationError("expired or future-dated attestation");
  }
  let sigBytes: Uint8Array;
  let pubBytes: Uint8Array;
  try {
    sigBytes = bs58.decode(att.signature);
    pubBytes = bs58.decode(cfg.perPubkeyBase58);
  } catch {
    throw new AttestationError("malformed signature or pubkey");
  }
  if (sigBytes.length !== 64) throw new AttestationError("invalid signature length");
  if (pubBytes.length !== 32) throw new AttestationError("invalid pubkey length");

  const msg = new TextEncoder().encode(canonicalMessage(att));
  const ok = nacl.sign.detached.verify(msg, sigBytes, pubBytes);
  if (!ok) throw new AttestationError("signature does not verify");
}

/**
 * Dev-side signer. In production this lives inside the PER and we never
 * import it — only the verifier above runs in the API.
 */
export function signAttestationForDev(
  attUnsigned: Omit<Attestation, "signature">,
  secretKeyBytes: Uint8Array,
): Attestation {
  const msg = new TextEncoder().encode(canonicalMessage(attUnsigned));
  const sig = nacl.sign.detached(msg, secretKeyBytes);
  return { ...attUnsigned, signature: bs58.encode(sig) };
}
