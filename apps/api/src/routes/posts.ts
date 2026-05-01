import { Router, type Router as ExpressRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { type DB, schema } from "../db/index.js";
import { BadgeTokenError, verifyBadgeToken } from "../per/token.js";
import { deriveAuthorAnonId, sha256Hex } from "../per/anon.js";
import { signAttestationForDev } from "../attestation.js";
import { randomUUID } from "node:crypto";

export interface PostsRouterDeps {
  db: DB;
  perPubkeyBase58: string;
  /**
   * Present in dev (we are also the PER signer). In prod the API is verify-only
   * and the attestation is supplied by the client after a round-trip to the TEE.
   */
  perSecretKey?: Uint8Array;
}

const createPostBody = z.object({
  content: z.string().min(1).max(2000),
});

const MIN_STAKE_LAMPORTS = 100_000n; // 0.0001 SOL stake bond — anti-spam

const BEARER_PATTERN = /^Bearer\s+(.+)$/;

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
        deps.db.select().from(schema.comments).where(eq(schema.comments.postId, id)),
        deps.db.select().from(schema.reactions).where(eq(schema.reactions.postId, id)),
      ]);
      res.json({ post, comments: postComments, reactions: postReactions });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      // Bearer badge_token authenticates the post.
      const auth = req.headers.authorization ?? "";
      const m = auth.match(BEARER_PATTERN);
      if (!m) {
        res.status(401).json({ error: "missing_badge_token" });
        return;
      }
      const token = m[1]!;

      let payload: ReturnType<typeof verifyBadgeToken>;
      try {
        payload = verifyBadgeToken(token, deps.perPubkeyBase58);
      } catch (err) {
        if (err instanceof BadgeTokenError) {
          res.status(401).json({ error: "invalid_badge_token", reason: err.reason });
          return;
        }
        throw err;
      }

      const parsed = createPostBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }

      const postId = randomUUID();
      const contentHash = sha256Hex(parsed.data.content);
      const authorAnonId = deriveAuthorAnonId(payload.anonSeed, payload.kind);
      const issuedAt = Math.floor(Date.now() / 1000);

      // The PER (in dev: us) signs an attestation that proves a valid badge
      // holder authored this post, without exposing the holder.
      if (!deps.perSecretKey) {
        throw new Error("dev PER secret unavailable; in prod the client supplies the attestation");
      }
      const attestation = signAttestationForDev(
        {
          action: "post",
          anonId: authorAnonId,
          badgeKind: payload.kind,
          resourceId: postId,
          contentHash,
          issuedAt,
        },
        deps.perSecretKey,
      );

      const [inserted] = await deps.db
        .insert(schema.posts)
        .values({
          id: postId,
          authorAnonId,
          badgeKind: payload.kind,
          content: parsed.data.content,
          contentHash,
          perAttestation: attestation.signature,
          stakeLamports: MIN_STAKE_LAMPORTS,
        })
        .returning();
      if (!inserted) throw new Error("failed to insert post");

      res.status(201).json({ post: inserted });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
