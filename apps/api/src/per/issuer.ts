import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { schema } from "../db/index.js";
import { BADGE_LABELS, type BadgeKind, type EvidenceVerifier } from "./evidence.js";
import { newAnonSeed, signBadgeToken, walletFingerprint } from "./token.js";
import { verifyWalletSignature } from "./verifier.js";

/**
 * The PER badge issuer. Conceptually runs inside the TEE; in dev it runs in
 * this process. Either way, it is the ONLY component that ever sees the
 * caller's wallet — the public DB only learns about a `kind` and a public
 * `on_chain_pubkey` (a stub in dev, a real NFT mint in prod).
 */
export interface BadgeIssuerDeps {
  db: DB;
  evidence: EvidenceVerifier;
  perSecretKey: Uint8Array;
  perPubkeyBase58: string;
  /** Stub on-chain mint generator. Real impl invokes the badge program. */
  mintBadgeOnChain?: (args: { kind: BadgeKind; walletBase58: string }) => Promise<string>;
  now?: () => number;
  tokenTtlSeconds?: number;
}

export class BadgeIssuanceError extends Error {
  constructor(public readonly reason: string) {
    super(`Badge issuance failed: ${reason}`);
    this.name = "BadgeIssuanceError";
  }
}

export interface ClaimRequest {
  walletBase58: string;
  kind: BadgeKind;
  challenge: string;
  signatureBase58: string;
}

export interface ClaimResult {
  badgeId: string;
  kind: BadgeKind;
  label: string;
  onChainPubkey: string;
  badgeToken: string;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h

export class BadgeIssuer {
  constructor(private readonly deps: BadgeIssuerDeps) {}

  async issue(req: ClaimRequest): Promise<ClaimResult> {
    if (!(req.kind in BADGE_LABELS)) {
      throw new BadgeIssuanceError(`unknown badge kind: ${req.kind}`);
    }

    try {
      verifyWalletSignature({
        walletBase58: req.walletBase58,
        challenge: req.challenge,
        signatureBase58: req.signatureBase58,
      });
    } catch (err) {
      throw new BadgeIssuanceError(`wallet signature: ${(err as Error).message}`);
    }

    const evidence = await this.deps.evidence.check({
      walletBase58: req.walletBase58,
      kind: req.kind,
    });
    if (!evidence.ok) {
      throw new BadgeIssuanceError(`evidence check failed: ${evidence.reason ?? "unknown reason"}`);
    }

    const onChainPubkey = await this.mint(req);

    const [inserted] = await this.deps.db
      .insert(schema.badges)
      .values({ kind: req.kind, onChainPubkey })
      .returning({ id: schema.badges.id });
    if (!inserted) throw new BadgeIssuanceError("failed to record badge in DB");

    const now = (this.deps.now ?? (() => Math.floor(Date.now() / 1000)))();
    const exp = now + (this.deps.tokenTtlSeconds ?? DEFAULT_TTL_SECONDS);
    const badgeToken = signBadgeToken(
      {
        badgeId: inserted.id,
        kind: req.kind,
        anonSeed: newAnonSeed(),
        walletFingerprint: walletFingerprint(req.walletBase58),
        iat: now,
        exp,
      },
      this.deps.perSecretKey,
    );

    return {
      badgeId: inserted.id,
      kind: req.kind,
      label: BADGE_LABELS[req.kind],
      onChainPubkey,
      badgeToken,
      expiresAt: exp,
    };
  }

  private async mint(req: ClaimRequest): Promise<string> {
    if (this.deps.mintBadgeOnChain) {
      return this.deps.mintBadgeOnChain({ kind: req.kind, walletBase58: req.walletBase58 });
    }
    // Stub mint: deterministic-looking opaque pubkey. Phase 10 swaps in a real
    // Anchor program call and returns the actual mint pubkey.
    return `stub_${req.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export async function getBadgeById(db: DB, id: string) {
  const [row] = await db.select().from(schema.badges).where(eq(schema.badges.id, id)).limit(1);
  return row ?? null;
}
