import { Router, type Router as ExpressRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { type DB, schema } from "../db/index.js";

export interface UsersRouterDeps {
  db: DB;
}

/**
 * Public profile API.
 *
 * Privacy invariants enforced here:
 *   - Endpoints are keyed by `anonId` (or username), never by wallet
 *   - We expose author posts/comments because that's already derivable
 *     from a public scan of /posts; serving them directly is a UX win
 *     with no new leak surface
 *   - We DO NOT expose this anon's reactions publicly. Aggregate
 *     up/down counts on each post are public; "what specific posts has
 *     anon X upvoted?" is not. That keeps voting-pattern fingerprinting
 *     more expensive for an outside observer.
 */
export function usersRouter(deps: UsersRouterDeps): ExpressRouter {
  const router = Router();

  /**
   * Resolve a handle to its anon. Accepts either the lowercased username
   * or the raw `anon_e81f5a...` form.
   */
  router.get("/by-handle/:handle", async (req, res, next) => {
    try {
      const handle = req.params.handle.toLowerCase();
      if (handle.startsWith("anon_")) {
        // Treat as anon directly. We can't validate further without
        // touching every table — return a stub and let downstream queries
        // 404 if there's no content.
        res.json({ anonId: handle, username: null });
        return;
      }
      const [row] = await deps.db
        .select({ username: schema.usernames.username, anonId: schema.usernames.anonId, badgeKind: schema.usernames.badgeKind })
        .from(schema.usernames)
        .where(eq(schema.usernames.username, handle))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "username_not_found" });
        return;
      }
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  /**
   * Profile bundle — anon metadata + counts. UI uses this for the header
   * card on /u/[handle]; the post + comment lists are paginated under
   * separate endpoints below.
   */
  router.get("/:anonId", async (req, res, next) => {
    try {
      const anonId = req.params.anonId;

      const [name] = await deps.db
        .select({ username: schema.usernames.username, badgeKind: schema.usernames.badgeKind, createdAt: schema.usernames.createdAt })
        .from(schema.usernames)
        .where(eq(schema.usernames.anonId, anonId))
        .limit(1);

      const [stats] = await deps.db
        .select({
          postCount: sql<number>`count(*)::int`.as("post_count"),
          firstSeen: sql<Date | null>`min(created_at)`.as("first_seen"),
        })
        .from(schema.posts)
        .where(and(eq(schema.posts.authorAnonId, anonId), sql`${schema.posts.deletedAt} IS NULL`));

      const [commentStats] = await deps.db
        .select({ commentCount: sql<number>`count(*)::int`.as("comment_count") })
        .from(schema.comments)
        .where(and(eq(schema.comments.authorAnonId, anonId), sql`${schema.comments.deletedAt} IS NULL`));

      res.json({
        anonId,
        username: name?.username ?? null,
        badgeKind: name?.badgeKind ?? null,
        joinedAt: name?.createdAt ?? null,
        postCount: stats?.postCount ?? 0,
        commentCount: commentStats?.commentCount ?? 0,
        firstSeen: stats?.firstSeen ?? null,
      });
    } catch (err) {
      next(err);
    }
  });

  /** All posts authored by this anon, newest first. */
  router.get("/:anonId/posts", async (req, res, next) => {
    try {
      const anonId = req.params.anonId;
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 100);
      const rows = await deps.db
        .select({
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
          displayName: schema.usernames.username,
        })
        .from(schema.posts)
        .leftJoin(schema.usernames, eq(schema.usernames.anonId, schema.posts.authorAnonId))
        .where(eq(schema.posts.authorAnonId, anonId))
        .orderBy(desc(schema.posts.createdAt))
        .limit(limit);
      res.json({ posts: rows });
    } catch (err) {
      next(err);
    }
  });

  /** All comments authored by this anon, newest first. */
  router.get("/:anonId/comments", async (req, res, next) => {
    try {
      const anonId = req.params.anonId;
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 100);
      const rows = await deps.db
        .select({
          id: schema.comments.id,
          postId: schema.comments.postId,
          parentId: schema.comments.parentId,
          authorAnonId: schema.comments.authorAnonId,
          badgeKind: schema.comments.badgeKind,
          content: schema.comments.content,
          perAttestation: schema.comments.perAttestation,
          upCount: schema.comments.upCount,
          downCount: schema.comments.downCount,
          replyCount: schema.comments.replyCount,
          createdAt: schema.comments.createdAt,
          updatedAt: schema.comments.updatedAt,
          deletedAt: schema.comments.deletedAt,
          displayName: schema.usernames.username,
        })
        .from(schema.comments)
        .leftJoin(schema.usernames, eq(schema.usernames.anonId, schema.comments.authorAnonId))
        .where(eq(schema.comments.authorAnonId, anonId))
        .orderBy(desc(schema.comments.createdAt))
        .limit(limit);
      res.json({ comments: rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
