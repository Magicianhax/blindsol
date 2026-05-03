import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
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
  title: z.string().min(1).max(160),
  content: z.string().max(2000).default(""),
  fromWallet: z.string().min(32).max(44),
});

const finalizeBody = z.object({
  // Opaque uuid issued by /prepare. Wallet address never round-trips
  // through the user any more — it lives in `prepared_stake_bonds`.
  receiptId: z.string().uuid(),
  txSignature: z.string().min(32).max(128),
  title: z.string().min(1).max(160),
  content: z.string().max(2000).default(""),
});

/** Public projection of `posts` — strips `stake_tx_signature`-shaped
 *  fields that could leak the wallet via on-chain RPC lookup. */
const publicPostColumns = {
  id: schema.posts.id,
  authorAnonId: schema.posts.authorAnonId,
  badgeKind: schema.posts.badgeKind,
  title: schema.posts.title,
  content: schema.posts.content,
  contentHash: schema.posts.contentHash,
  perAttestation: schema.posts.perAttestation,
  stakeLamports: schema.posts.stakeLamports,
  upCount: schema.posts.upCount,
  downCount: schema.posts.downCount,
  commentCount: schema.posts.commentCount,
  createdAt: schema.posts.createdAt,
  updatedAt: schema.posts.updatedAt,
  deletedAt: schema.posts.deletedAt,
} as const;

/** Canonical hashable form: `${title}\n${body}`. Title alone is fine. */
function canonicalText(title: string, content: string): string {
  const t = title.trim();
  const c = content.trim();
  return c.length === 0 ? t : `${t}\n${c}`;
}

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
            .select(publicPostColumns)
            .from(schema.posts)
            .where(eq(schema.posts.badgeKind, badge))
            .orderBy(desc(schema.posts.createdAt))
            .limit(limit)
        : await deps.db
            .select(publicPostColumns)
            .from(schema.posts)
            .orderBy(desc(schema.posts.createdAt))
            .limit(limit);

      res.json({ posts: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const [post] = await deps.db
        .select(publicPostColumns)
        .from(schema.posts)
        .where(eq(schema.posts.id, id))
        .limit(1);
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
      const canonical = canonicalText(parsed.data.title, parsed.data.content);
      const contentHash = sha256Hex(canonical);

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
        title: parsed.data.title,
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

      let receiptPayload;
      try {
        receiptPayload = await deps.stakeBond.verifyOnChain({
          receiptId: parsed.data.receiptId,
          txSignature: parsed.data.txSignature,
        });
      } catch (err) {
        if (err instanceof StakeBondError) {
          res.status(400).json({ error: "stake_bond_invalid", reason: err.reason });
          return;
        }
        throw err;
      }

      const canonical = canonicalText(parsed.data.title, parsed.data.content);
      const recomputedHash = sha256Hex(canonical);
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
          title: parsed.data.title,
          content: parsed.data.content,
          contentHash: receiptPayload.contentHash,
          perAttestation: attestation.signature,
          stakeLamports: BigInt(receiptPayload.expectedAmountRaw),
        })
        .returning();
      if (!inserted) throw new Error("failed to insert post");

      // Audit log records the SHA256 of the tx signature, never the raw
      // signature itself — preserves "did this post pay?" forensic answer
      // without giving anyone holding the audit row a chain pointer to
      // the wallet that signed.
      await deps.db.insert(schema.auditEvents).values({
        kind: "post_created",
        subjectId: inserted.id,
        actorAnonId: authorAnonId,
        badgeKind: session.token.kind,
        meta: JSON.stringify({
          stakeTxSignatureHash: sha256Hex(parsed.data.txSignature),
          stakeLamports: receiptPayload.expectedAmountRaw,
        }),
      });

      res.status(201).json({ post: inserted });
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

      // Bump the parent's reply counters.
      await deps.db
        .update(schema.posts)
        .set({ commentCount: sql`${schema.posts.commentCount} + 1`, updatedAt: new Date() })
        .where(eq(schema.posts.id, postId));
      if (parsed.data.parentId) {
        await deps.db
          .update(schema.comments)
          .set({ replyCount: sql`${schema.comments.replyCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.comments.id, parsed.data.parentId));
      }

      await deps.db.insert(schema.auditEvents).values({
        kind: "comment_created",
        subjectId: inserted.id,
        actorAnonId: authorAnonId,
        badgeKind: session.token.kind,
        meta: JSON.stringify({ postId, parentId: parsed.data.parentId ?? null }),
      });

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

      // Bump the post's denormalized counters so feed reads stay cheap.
      if (kind === "up") {
        await deps.db
          .update(schema.posts)
          .set({ upCount: sql`${schema.posts.upCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.posts.id, postId));
      } else if (kind === "down") {
        await deps.db
          .update(schema.posts)
          .set({ downCount: sql`${schema.posts.downCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.posts.id, postId));
      }

      await deps.db.insert(schema.auditEvents).values({
        kind: "reaction_created",
        subjectId: inserted.id,
        actorAnonId: reactorAnonId,
        badgeKind: session.token.kind,
        meta: JSON.stringify({ postId, reactionKind: kind }),
      });

      res.status(201).json({ reaction: inserted, created: true });
    } catch (err) {
      next(err);
    }
  });

  // ─── Comment-level reactions ───────────────────────────────────────
  // Symmetric with /:id/reactions but the subject is a comment. Uses
  // the same `reactions` table via the polymorphic `comment_id` column.

  router.post("/comments/:commentId/reactions", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      const parsed = createReactionBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      const commentId = req.params.commentId;
      const [comment] = await deps.db
        .select()
        .from(schema.comments)
        .where(eq(schema.comments.id, commentId))
        .limit(1);
      if (!comment) {
        res.status(404).json({ error: "comment_not_found" });
        return;
      }

      const reactorAnonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);
      const kind = parsed.data.kind;

      const existingRows = await deps.db
        .select()
        .from(schema.reactions)
        .where(
          and(
            eq(schema.reactions.commentId, commentId),
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
          resourceId: `comment:${commentId}:${kind}`,
          contentHash: "",
          issuedAt,
        },
        deps.perSecretKey,
      );

      const [inserted] = await deps.db
        .insert(schema.reactions)
        .values({
          id: reactionId,
          commentId,
          reactorAnonId,
          kind,
          perAttestation: attestation.signature,
        })
        .returning();
      if (!inserted) throw new Error("failed to insert comment reaction");

      if (kind === "up") {
        await deps.db
          .update(schema.comments)
          .set({ upCount: sql`${schema.comments.upCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.comments.id, commentId));
      } else if (kind === "down") {
        await deps.db
          .update(schema.comments)
          .set({ downCount: sql`${schema.comments.downCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.comments.id, commentId));
      }

      await deps.db.insert(schema.auditEvents).values({
        kind: "reaction_created",
        subjectId: inserted.id,
        actorAnonId: reactorAnonId,
        badgeKind: session.token.kind,
        meta: JSON.stringify({ commentId, reactionKind: kind }),
      });

      res.status(201).json({ reaction: inserted, created: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Reserved for future fallback flows (e.g. comment stakes).
void FALLBACK_STAKE_LAMPORTS;
