import { createHash, createHmac } from "node:crypto";

/**
 * Derive a stable, opaque author identity for a holder of a badge.
 *
 * Properties:
 *   - same `anonSeed` always produces the same anon_id (so an author's posts
 *     can be threaded together on the feed)
 *   - different seeds produce different IDs
 *   - given `anon_id`, you cannot recover `anonSeed` or the wallet — `anonSeed`
 *     is a 32-byte secret that lives only inside the badge token, signed by
 *     the PER and held by the user
 *
 * The `kind` is mixed in so a wallet that earns multiple badges still gets a
 * fresh anon per badge type.
 */
export function deriveAuthorAnonId(anonSeedHex: string, kind: string): string {
  const h = createHmac("sha256", Buffer.from(anonSeedHex, "hex"));
  h.update(`anon|${kind}`);
  return `anon_${h.digest("hex").slice(0, 16)}`;
}

/**
 * Deterministic per-(wallet, kind) anon seed.
 *
 * `anonSeed = HMAC-SHA256(perSecret, "anon-seed-v1|" + wallet + "|" + kind)`
 *
 * The wallet pubkey is fed into the HMAC inside the TEE and immediately
 * discarded. The DB only ever sees the resulting anon_id; no wallet column
 * is ever written. The HMAC is one-way, so leaking the DB or the seed does
 * NOT recover the wallet (you'd need `perSecret`, which lives only inside
 * the enclave).
 *
 * Why deterministic: same wallet + same badge kind produces the same
 * anon every time, on every device, after any localStorage wipe. That's
 * what makes "log in on a new phone and your username is right there" work
 * without storing the wallet anywhere.
 */
export function deriveAnonSeedFromWallet(
  perSecretKey: Uint8Array,
  walletBase58: string,
  kind: string,
): string {
  const h = createHmac("sha256", Buffer.from(perSecretKey));
  h.update(`anon-seed-v1|${walletBase58}|${kind}`);
  return h.digest("hex");
}

/**
 * Convenience: directly derive the public anon_id for a given (wallet, kind),
 * skipping the intermediate seed for callers that don't need it (sign-in
 * lookup loops where we only want the anon_ids to query against).
 */
export function deriveAnonIdFromWallet(
  perSecretKey: Uint8Array,
  walletBase58: string,
  kind: string,
): string {
  const seed = deriveAnonSeedFromWallet(perSecretKey, walletBase58, kind);
  return deriveAuthorAnonId(seed, kind);
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
