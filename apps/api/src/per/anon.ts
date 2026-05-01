import { createHash, createHmac } from "node:crypto";

/**
 * Derive a stable, opaque author identity for a holder of a badge.
 *
 * Properties:
 *   - same `anonSeed` always produces the same anon_id (so an author's posts
 *     can be threaded together on the feed)
 *   - different seeds produce different IDs (re-claiming gets a new identity)
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

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
