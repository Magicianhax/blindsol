import { Router, type Router as ExpressRouter } from "express";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { type DB, schema } from "../db/index.js";
import { deriveAnonIdFromWallet, deriveAnonSeedFromWallet } from "../per/anon.js";
import { BADGE_KINDS, BADGE_LABELS, type BadgeKind, type EvidenceVerifier } from "../per/evidence.js";
import { signBadgeToken, walletFingerprint } from "../per/token.js";
import { verifyWalletSignature, WalletSignatureError } from "../per/verifier.js";

export interface AuthRouterDeps {
  db: DB;
  perSecretKey: Uint8Array;
  /**
   * Re-checks on-chain holdings on every sign-in. Required so a wallet
   * that sold its $BONK can no longer post as a verified $BONK holder.
   * Past posts stay (they were valid at the time), but new posting rights
   * die when the bag dies.
   */
  evidence: EvidenceVerifier;
  /** Token TTL after sign-in. Defaults to 24h. */
  tokenTtlSeconds?: number;
  /** Challenge TTL. Defaults to 5 minutes. */
  challengeTtlSeconds?: number;
}

const DEFAULT_TOKEN_TTL = 60 * 60 * 24;
const DEFAULT_CHALLENGE_TTL = 5 * 60;

/**
 * Sign-in protocol — restores a wallet's badges on a fresh device without
 * ever persisting the wallet:
 *
 *   1. Client → GET  /auth/challenge       → server returns { nonce, expiresAt }
 *      Server inserts the nonce into auth_challenges with expires_at = now+5m.
 *
 *   2. Client signs the message
 *        "BlindSol sign-in — nonce <nonce> — expires <expiresAt>"
 *      with their wallet's secret key. The message format is fixed and
 *      pinned to a single nonce, so it's not a generic-text-signing attack.
 *
 *   3. Client → POST /auth/sign-in { wallet, signature, nonce }
 *      Server:
 *        a. Looks up the nonce row, verifies it exists, hasn't expired,
 *           and hasn't already been consumed. Marks consumed atomically.
 *        b. Verifies the ed25519 signature against the wallet pubkey.
 *        c. For every supported badge kind, derives anonId = HMAC(...).
 *           Wallet bytes only live in this function's stack frame and the
 *           Buffer used by HMAC; they never leave. No DB write touches the
 *           wallet.
 *        d. Queries badges WHERE anon_id IN (derived ids), returns one
 *           fresh badge token per existing badge.
 *
 * Privacy properties preserved:
 *   - DB never sees a wallet column.
 *   - HMAC is one-way under perSecret; even with full DB+nonce-store leak
 *     you cannot recover the wallet from anon_id.
 *   - Sign-in does not create new badges — it only resurfaces ones the
 *     wallet already legitimately claimed (which required on-chain proof
 *     at original claim time).
 */
export function authRouter(deps: AuthRouterDeps): ExpressRouter {
  const router = Router();

  router.get("/challenge", async (_req, res, next) => {
    try {
      const nonce = randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + (deps.challengeTtlSeconds ?? DEFAULT_CHALLENGE_TTL) * 1000);
      await deps.db.insert(schema.authChallenges).values({ nonce, expiresAt });

      // Best-effort cleanup: drop expired challenges on every issue. Cheap
      // because expires_at is indexed. Keeps the table from growing.
      await deps.db.delete(schema.authChallenges).where(lt(schema.authChallenges.expiresAt, new Date()));

      res.json({
        nonce,
        expiresAt: expiresAt.toISOString(),
        message: signInMessage(nonce, expiresAt),
      });
    } catch (err) {
      next(err);
    }
  });

  const signInBody = z.object({
    wallet: z.string().min(32).max(44),
    signature: z.string().min(64).max(128),
    nonce: z.string().length(48),
  });

  router.post("/sign-in", async (req, res, next) => {
    try {
      const parsed = signInBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }
      const { wallet, signature, nonce } = parsed.data;

      // 1. Look up + atomically consume the nonce.
      const [challenge] = await deps.db
        .select()
        .from(schema.authChallenges)
        .where(eq(schema.authChallenges.nonce, nonce))
        .limit(1);

      if (!challenge) {
        res.status(400).json({ error: "challenge_not_found" });
        return;
      }
      if (challenge.consumedAt) {
        res.status(400).json({ error: "challenge_already_used" });
        return;
      }
      if (challenge.expiresAt.getTime() < Date.now()) {
        res.status(400).json({ error: "challenge_expired" });
        return;
      }

      // Mark consumed before doing anything expensive — prevents replay if
      // a concurrent request lands while signature verification is running.
      const consumed = await deps.db
        .update(schema.authChallenges)
        .set({ consumedAt: new Date() })
        .where(and(eq(schema.authChallenges.id, challenge.id), isNull(schema.authChallenges.consumedAt)))
        .returning({ id: schema.authChallenges.id });
      if (consumed.length === 0) {
        res.status(400).json({ error: "challenge_already_used" });
        return;
      }

      // 2. Verify the signature over the canonical sign-in message.
      const message = signInMessage(nonce, challenge.expiresAt);
      try {
        verifyWalletSignature({ walletBase58: wallet, challenge: message, signatureBase58: signature });
      } catch (err) {
        if (err instanceof WalletSignatureError) {
          res.status(400).json({ error: "bad_signature", reason: err.reason });
          return;
        }
        throw err;
      }

      // 3. Derive every possible anon_id this wallet could own. This is
      //    KIND_COUNT × HMAC(); fast. Then a single SQL IN-query.
      const candidates: Array<{ kind: BadgeKind; anonId: string; anonSeed: string }> = (
        BADGE_KINDS as readonly BadgeKind[]
      ).map((kind) => ({
        kind,
        anonSeed: deriveAnonSeedFromWallet(deps.perSecretKey, wallet, kind),
        anonId: deriveAnonIdFromWallet(deps.perSecretKey, wallet, kind),
      }));

      const anonIds = candidates.map((c) => c.anonId);
      const rows = anonIds.length
        ? await deps.db
            .select({ id: schema.badges.id, kind: schema.badges.kind, anonId: schema.badges.anonId, onChainPubkey: schema.badges.onChainPubkey })
            .from(schema.badges)
            .where(inArray(schema.badges.anonId, anonIds))
        : [];

      // Re-check on-chain holdings for every candidate badge. A wallet that
      // sold the bag should NOT get a fresh posting token — past posts stay,
      // but new posting rights end when current holdings end. Run the checks
      // in parallel since each is an independent RPC call.
      const stillHolds = await Promise.all(
        rows.map(async (row) => {
          try {
            const ev = await deps.evidence.check({ walletBase58: wallet, kind: row.kind as BadgeKind });
            return ev.ok;
          } catch {
            // Fail closed — if RPC is unavailable we'd rather have a transient
            // sign-in failure than hand out tokens we couldn't verify.
            return false;
          }
        }),
      );
      const validRows = rows.filter((_, i) => stillHolds[i]);

      const fp = walletFingerprint(wallet);
      const now = Math.floor(Date.now() / 1000);
      const exp = now + (deps.tokenTtlSeconds ?? DEFAULT_TOKEN_TTL);

      const badges = validRows.map((row) => {
        const seedRow = candidates.find((c) => c.anonId === row.anonId)!;
        const badgeToken = signBadgeToken(
          {
            badgeId: row.id,
            kind: row.kind,
            anonSeed: seedRow.anonSeed,
            walletFingerprint: fp,
            iat: now,
            exp,
          },
          deps.perSecretKey,
        );
        return {
          badgeId: row.id,
          kind: row.kind as BadgeKind,
          label: BADGE_LABELS[row.kind as BadgeKind] ?? row.kind,
          onChainPubkey: row.onChainPubkey,
          anonId: row.anonId!,
          badgeToken,
          expiresAt: exp,
        };
      });

      res.json({
        badges,
        // Surface how many candidates were dropped due to no-longer-holds
        // so the client can show a friendly "your $BONK badge can't be
        // restored — wallet no longer holds the token" notice if it wants.
        droppedDueToHoldings: rows.length - badges.length,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

/**
 * Canonical message a wallet signs to redeem a challenge. Pinned format —
 * including the nonce in the prefix means a leaked signature can't be
 * replayed against another nonce or another action.
 *
 * The prefix is intentionally human-readable so wallet UIs (Phantom,
 * Backpack, Solflare) display something the user can verify before
 * approving the signature.
 */
function signInMessage(nonce: string, expiresAt: Date): string {
  return `BlindSol sign-in — nonce ${nonce} — expires ${expiresAt.toISOString()}`;
}

