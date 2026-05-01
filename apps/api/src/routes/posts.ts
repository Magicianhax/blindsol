import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { type DB, schema } from "../db/index.js";
import { deriveAuthorAnonId, sha256Hex } from "../per/anon.js";
import { signAttestationForDev } from "../attestation.js";
import { authBearerBadge } from "../per/session.js";
import { randomUUID } from "node:crypto";
import type { MagicBlockStakeService } from "../magicblock/stake-service.js";

export interface PostsRouterDeps {
  db: DB;
  perPubkeyBase58: string;
  /**
   * Present in dev (we are also the PER signer). In prod the API is verify-only
   * and the attestation is supplied by the client after a round-trip to the TEE.
   */
  perSecretKey?: Uint8Array;
  /**
   * Optional. When set, every successful POST /posts triggers a real private
   * USDC transfer through MagicBlock's PER as the stake bond.
   */
  stakeService?: MagicBlockStakeService;
}

const createPostBody = z.object({
  content: z.string().min(1).max(2000),
});

const createCommentBody = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});

const createReactionBody = z.object({
  kind: z.enum(["up", "down", "spam"]),
});

const MIN_STAKE_LAMPORTS = 100_000n;

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

function requireSecret(secret: Uint8Array | undefined): Uint8Array {
  if (!secret) throw new Error("dev PER secret unavailable; in prod the client supplies the attestation");
  return secret;
}

export function postsRouter(deps: PostsRouterDeps): ExpressRouter {
  const router = Router();

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

  router.post("/", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      const parsed = createPostBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      const postId = randomUUID();
      const contentHash = sha256Hex(parsed.data.content);
      const authorAnonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);
      const issuedAt = Math.floor(Date.now() / 1000);

      const attestation = signAttestationForDev(
        {
          action: "post",
          anonId: authorAnonId,
          badgeKind: session.token.kind,
          resourceId: postId,
          contentHash,
          issuedAt,
        },
        requireSecret(deps.perSecretKey),
      );

      // Lock a stake bond via MagicBlock private transfer if configured.
      // This is real USDC moving on Solana mainnet beta + private settlement
      // through the PER. We surface failures as 502 so the client knows the
      // post wasn't recorded.
      let stakeReceipt: { signature: string; amountRaw: string } | undefined;
      if (deps.stakeService) {
        try {
          const r = await deps.stakeService.lockStake();
          stakeReceipt = { signature: r.signature, amountRaw: r.amountRaw };
        } catch (err) {
          res.status(502).json({
            error: "stake_failed",
            reason: (err as Error).message,
          });
          return;
        }
      }

      const [inserted] = await deps.db
        .insert(schema.posts)
        .values({
          id: postId,
          authorAnonId,
          badgeKind: session.token.kind,
          content: parsed.data.content,
          contentHash,
          perAttestation: attestation.signature,
          stakeLamports: stakeReceipt ? BigInt(stakeReceipt.amountRaw) : MIN_STAKE_LAMPORTS,
        })
        .returning();
      if (!inserted) throw new Error("failed to insert post");

      res.status(201).json({ post: inserted, stake: stakeReceipt });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/comments", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      const parsed = createCommentBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      // Confirm the parent post exists, and (if threading) that the parent
      // comment belongs to it.
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
        requireSecret(deps.perSecretKey),
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

      // Idempotent insert: same (post, anon, kind) returns existing row.
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
        requireSecret(deps.perSecretKey),
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
