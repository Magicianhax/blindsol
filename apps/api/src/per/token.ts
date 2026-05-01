import bs58 from "bs58";
import nacl from "tweetnacl";
import { createHash, randomBytes } from "node:crypto";

/**
 * Bearer token issued by the PER after a successful badge claim.
 *
 * Stateless by design: contains everything needed to derive an `author_anon_id`
 * later, signed by the PER's ed25519 key. The wallet is never present in the
 * token payload — only an opaque `anonSeed` derived inside the TEE.
 */
export interface BadgeTokenPayload {
  badgeId: string;
  kind: string;
  anonSeed: string; // 32-byte secret, hex; never leaves the TEE except as part of this token
  walletFingerprint: string; // sha256(wallet) — used for replay binding only
  iat: number; // issued-at, unix seconds
  exp: number; // expires-at, unix seconds
}

const TOKEN_VERSION = "blindsol-bt-v1";

export class BadgeTokenError extends Error {
  constructor(public readonly reason: string) {
    super(`BadgeToken rejected: ${reason}`);
    this.name = "BadgeTokenError";
  }
}

/**
 * Encode payload + signature as: "<version>.<base64url(payload)>.<base58(sig)>"
 */
export function signBadgeToken(payload: BadgeTokenPayload, secretKey: Uint8Array): string {
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(Buffer.from(payloadJson, "utf8"));
  const msg = new TextEncoder().encode(`${TOKEN_VERSION}.${payloadB64}`);
  const sig = nacl.sign.detached(msg, secretKey);
  return `${TOKEN_VERSION}.${payloadB64}.${bs58.encode(sig)}`;
}

export function verifyBadgeToken(
  token: string,
  publicKeyBase58: string,
  now: () => number = () => Math.floor(Date.now() / 1000),
): BadgeTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    throw new BadgeTokenError("malformed token");
  }
  const [version, payloadB64, sigB58] = parts;

  let pubBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubBytes = bs58.decode(publicKeyBase58);
    sigBytes = bs58.decode(sigB58!);
  } catch {
    throw new BadgeTokenError("malformed signature or pubkey encoding");
  }
  if (pubBytes.length !== 32) throw new BadgeTokenError("pubkey wrong length");
  if (sigBytes.length !== 64) throw new BadgeTokenError("signature wrong length");

  const msg = new TextEncoder().encode(`${version}.${payloadB64}`);
  if (!nacl.sign.detached.verify(msg, sigBytes, pubBytes)) {
    throw new BadgeTokenError("signature does not verify");
  }

  let payload: BadgeTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(base64UrlDecode(payloadB64!)).toString("utf8")) as BadgeTokenPayload;
  } catch {
    throw new BadgeTokenError("malformed payload");
  }

  const t = now();
  if (typeof payload.exp !== "number" || t > payload.exp) throw new BadgeTokenError("token expired");
  if (typeof payload.iat !== "number" || payload.iat - 60 > t) throw new BadgeTokenError("token issued in the future");

  return payload;
}

export function newAnonSeed(): string {
  return randomBytes(32).toString("hex");
}

export function walletFingerprint(walletBase58: string): string {
  return createHash("sha256").update(walletBase58).digest("hex");
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}
