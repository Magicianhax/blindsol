import { eq } from "drizzle-orm";
import type { DB } from "../db/index.js";
import { schema } from "../db/index.js";
import { deriveAnonSeedFromWallet, deriveAuthorAnonId } from "./anon.js";
import { BADGE_LABELS, type BadgeKind, type EvidenceVerifier } from "./evidence.js";
import { signBadgeToken, walletFingerprint } from "./token.js";
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
  /** Deterministic anon id derived inside the TEE. Public, stable per (wallet, kind). */
  anonId: string;
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

    // Deterministic anon derivation: same wallet + same kind always produces
    // the same anon_id. The wallet pubkey enters the HMAC inside the TEE here
    // and is immediately discarded — it never reaches a row in the DB.
    const anonSeed = deriveAnonSeedFromWallet(this.deps.perSecretKey, req.walletBase58, req.kind);
    const anonId = deriveAuthorAnonId(anonSeed, req.kind);

    // If a badge already exists for this anon_id we reuse the row instead of
    // creating a duplicate. This is what makes "log in on a new device, claim,
    // and find all your old posts already there" work.
    const existing = await this.deps.db
      .select({ id: schema.badges.id, onChainPubkey: schema.badges.onChainPubkey })
      .from(schema.badges)
      .where(eq(schema.badges.anonId, anonId))
      .limit(1);

    let badgeId: string;
    let onChainPubkey: string;
    if (existing[0]) {
      badgeId = existing[0].id;
      onChainPubkey = existing[0].onChainPubkey;
    } else {
      onChainPubkey = await this.mint(req);
      const [inserted] = await this.deps.db
        .insert(schema.badges)
        .values({ kind: req.kind, onChainPubkey, anonId })
        .returning({ id: schema.badges.id });
      if (!inserted) throw new BadgeIssuanceError("failed to record badge in DB");
      badgeId = inserted.id;

      await this.deps.db.insert(schema.auditEvents).values({
        kind: "badge_issued",
        subjectId: badgeId,
        actorAnonId: null,
        badgeKind: req.kind,
        meta: JSON.stringify({ onChainPubkey }),
      });
    }

    const now = (this.deps.now ?? (() => Math.floor(Date.now() / 1000)))();
    const exp = now + (this.deps.tokenTtlSeconds ?? DEFAULT_TTL_SECONDS);
    const badgeToken = signBadgeToken(
      {
        badgeId,
        kind: req.kind,
        anonSeed,
        walletFingerprint: walletFingerprint(req.walletBase58),
        iat: now,
        exp,
      },
      this.deps.perSecretKey,
    );

    return {
      badgeId,
      kind: req.kind,
      label: BADGE_LABELS[req.kind],
      onChainPubkey,
      badgeToken,
      expiresAt: exp,
      anonId,
    };
  }

  private async mint(req: ClaimRequest): Promise<string> {
    if (this.deps.mintBadgeOnChain) {
      return this.deps.mintBadgeOnChain({ kind: req.kind, walletBase58: req.walletBase58 });
    }
    // Stub mint: deterministic-looking opaque pubkey. When BADGE_PROGRAM_ID
    // is set in env we swap this for a real on-chain mint via OnChainBadgeRegistry.
    return `stub_${req.kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export async function getBadgeById(db: DB, id: string) {
  const [row] = await db.select().from(schema.badges).where(eq(schema.badges.id, id)).limit(1);
  return row ?? null;
}
