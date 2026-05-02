import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { type DB, schema } from "../db/index.js";
import { deriveAuthorAnonId } from "../per/anon.js";
import { signAttestationForDev } from "../attestation.js";
import { authBearerBadge } from "../per/session.js";
import { randomUUID } from "node:crypto";
import { sha256Hex, StakeBondError, type StakeBondPipeline } from "../posts/stake-bond.js";

export interface PostsRouterDeps {
  db: DB;
  perPubkeyBase58: string;
  perSecretKey: Uint8Array;
  /**
   * Required when the platform demands a stake bond (production). When
   * absent, posts succeed without any payment — only useful for local
   * smoke runs without funded wallets.
   */
  stakeBond?: StakeBondPipeline;
}

const prepareBody = z.object({
  content: z.string().min(1).max(2000),
  fromWallet: z.string().min(32).max(44),
});

const finalizeBody = z.object({
  receipt: z.string().min(16),
  txSignature: z.string().min(32).max(128),
});

const createCommentBody = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});

const createReactionBody = z.object({
  kind: z.enum(["up", "down", "spam"]),
});

const FALLBACK_STAKE_LAMPORTS = 0n;

function authOrRespond(req: Request, res: Response, perPubkey: string) {
  const result = authBearerBadge(req, perPubkey);
  if (result.kind === "missing") {
    res.status(401).json({ error: "missing_badge_token" });
    return undefined;
  }
  if (result.kind === "invalid") {
    res.status(401).json({ error: "invalid_badge_token", reason: result.reason });
    return undefined;
  }
  return result.session;
}

export function postsRouter(deps: PostsRouterDeps): ExpressRouter {
  const router = Router();

  // ─── Reads ─────────────────────────────────────────────────────────

  router.get("/", async (req, res, next) => {
    try {
      const badge = typeof req.query.badge === "string" ? req.query.badge : undefined;
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 100);

      const rows = badge
        ? await deps.db
            .select()
            .from(schema.posts)
            .where(eq(schema.posts.badgeKind, badge))
            .orderBy(desc(schema.posts.createdAt))
            .limit(limit)
        : await deps.db.select().from(schema.posts).orderBy(desc(schema.posts.createdAt)).limit(limit);

      res.json({ posts: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const [post] = await deps.db.select().from(schema.posts).where(eq(schema.posts.id, id)).limit(1);
      if (!post) {
        res.status(404).json({ error: "post_not_found" });
        return;
      }
      const [postComments, postReactions] = await Promise.all([
        deps.db
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.postId, id))
          .orderBy(asc(schema.comments.createdAt)),
        deps.db.select().from(schema.reactions).where(eq(schema.reactions.postId, id)),
      ]);
      res.json({ post, comments: postComments, reactions: postReactions });
    } catch (err) {
      next(err);
    }
  });

  // ─── Two-step post commit (user-pays stake bond) ───────────────────

  router.post("/prepare", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      const parsed = prepareBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      const postId = randomUUID();
      const contentHash = sha256Hex(parsed.data.content);

      if (!deps.stakeBond) {
        res.status(503).json({
          error: "stake_unavailable",
          reason: "platform stake bond pipeline is not configured",
        });
        return;
      }

      const prepared = await deps.stakeBond.prepare({
        postId,
        contentHash,
        fromWallet: parsed.data.fromWallet,
        perSecretKey: deps.perSecretKey,
      });

      res.status(200).json({
        postId,
        content: parsed.data.content,
        contentHash,
        stakeBond: prepared,
      });
    } catch (err) {
      if (err instanceof StakeBondError) {
        res.status(502).json({ error: "stake_bond_build_failed", reason: err.reason });
        return;
      }
      next(err);
    }
  });

  router.post("/finalize", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      if (!deps.stakeBond) {
        res.status(503).json({ error: "stake_unavailable" });
        return;
      }

      const parsed = finalizeBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      // Need the original content too — we re-hash and verify it matches the
      // receipt the server signed during /prepare.
      const fullBody = z
        .object({
          receipt: z.string(),
          txSignature: z.string(),
          content: z.string().min(1).max(2000),
        })
        .safeParse(req.body);
      if (!fullBody.success) {
        res.status(400).json({ error: "invalid_request", details: fullBody.error.flatten() });
        return;
      }

      let receiptPayload;
      try {
        receiptPayload = await deps.stakeBond.verifyOnChain({
          receipt: fullBody.data.receipt,
          perPubkeyBase58: deps.perPubkeyBase58,
          txSignature: fullBody.data.txSignature,
        });
      } catch (err) {
        if (err instanceof StakeBondError) {
          res.status(400).json({ error: "stake_bond_invalid", reason: err.reason });
          return;
        }
        throw err;
      }

      const recomputedHash = sha256Hex(fullBody.data.content);
      if (recomputedHash !== receiptPayload.contentHash) {
        res.status(400).json({ error: "content_changed_since_prepare" });
        return;
      }

      const authorAnonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);
      const issuedAt = Math.floor(Date.now() / 1000);

      const attestation = signAttestationForDev(
        {
          action: "post",
          anonId: authorAnonId,
          badgeKind: session.token.kind,
          resourceId: receiptPayload.postId,
          contentHash: receiptPayload.contentHash,
          issuedAt,
        },
        deps.perSecretKey,
      );

      const [inserted] = await deps.db
        .insert(schema.posts)
        .values({
          id: receiptPayload.postId,
          authorAnonId,
          badgeKind: session.token.kind,
          content: fullBody.data.content,
          contentHash: receiptPayload.contentHash,
          perAttestation: attestation.signature,
          stakeLamports: BigInt(receiptPayload.expectedAmountRaw),
        })
        .returning();
      if (!inserted) throw new Error("failed to insert post");

      res.status(201).json({ post: inserted, stakeTxSignature: fullBody.data.txSignature });
    } catch (err) {
      next(err);
    }
  });

  // ─── Comments + reactions (no stake required) ──────────────────────

  router.post("/:id/comments", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      const parsed = createCommentBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      const postId = req.params.id;
      const [post] = await deps.db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
      if (!post) {
        res.status(404).json({ error: "post_not_found" });
        return;
      }
      if (parsed.data.parentId) {
        const [parent] = await deps.db
          .select()
          .from(schema.comments)
          .where(eq(schema.comments.id, parsed.data.parentId))
          .limit(1);
        if (!parent || parent.postId !== postId) {
          res.status(400).json({ error: "invalid_parent" });
          return;
        }
      }

      const commentId = randomUUID();
      const contentHash = sha256Hex(parsed.data.content);
      const authorAnonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);
      const issuedAt = Math.floor(Date.now() / 1000);

      const attestation = signAttestationForDev(
        {
          action: "comment",
          anonId: authorAnonId,
          badgeKind: session.token.kind,
          resourceId: commentId,
          contentHash,
          issuedAt,
        },
        deps.perSecretKey,
      );

      const [inserted] = await deps.db
        .insert(schema.comments)
        .values({
          id: commentId,
          postId,
          parentId: parsed.data.parentId ?? null,
          authorAnonId,
          badgeKind: session.token.kind,
          content: parsed.data.content,
          perAttestation: attestation.signature,
        })
        .returning();
      if (!inserted) throw new Error("failed to insert comment");

      res.status(201).json({ comment: inserted });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/reactions", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      const parsed = createReactionBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      const postId = req.params.id;
      const [post] = await deps.db.select().from(schema.posts).where(eq(schema.posts.id, postId)).limit(1);
      if (!post) {
        res.status(404).json({ error: "post_not_found" });
        return;
      }

      const reactorAnonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);
      const kind = parsed.data.kind;

      const existingRows = await deps.db
        .select()
        .from(schema.reactions)
        .where(
          and(
            eq(schema.reactions.postId, postId),
            eq(schema.reactions.reactorAnonId, reactorAnonId),
            eq(schema.reactions.kind, kind),
          ),
        )
        .limit(1);
      if (existingRows[0]) {
        res.status(200).json({ reaction: existingRows[0], created: false });
        return;
      }

      const reactionId = randomUUID();
      const issuedAt = Math.floor(Date.now() / 1000);
      const attestation = signAttestationForDev(
        {
          action: "reaction",
          anonId: reactorAnonId,
          badgeKind: session.token.kind,
          resourceId: `${postId}:${kind}`,
          contentHash: "",
          issuedAt,
        },
        deps.perSecretKey,
      );

      const [inserted] = await deps.db
        .insert(schema.reactions)
        .values({
          id: reactionId,
          postId,
          reactorAnonId,
          kind,
          perAttestation: attestation.signature,
        })
        .returning();
      if (!inserted) throw new Error("failed to insert reaction");

      res.status(201).json({ reaction: inserted, created: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Reserved for future fallback flows (e.g. comment stakes).
void FALLBACK_STAKE_LAMPORTS;
