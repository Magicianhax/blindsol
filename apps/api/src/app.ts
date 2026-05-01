import express, { type Express } from "express";
import { desc, eq } from "drizzle-orm";
import { type DB, schema } from "./db/index.js";
import type { BadgeIssuer } from "./per/issuer.js";
import { badgesRouter } from "./routes/badges.js";

// Bigint columns (e.g. stake_lamports) come back from Postgres as JS bigints.
// JSON.stringify refuses bigints by default; serialize them as strings so
// large lamport values stay precise on the wire.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export interface AppDeps {
  db: DB;
  badgeIssuer?: BadgeIssuer;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  app.disable("x-powered-by");

  if (deps.badgeIssuer) {
    app.use("/badges", badgesRouter({ issuer: deps.badgeIssuer, db: deps.db }));
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "blindsol-api" });
  });

  app.get("/posts", async (req, res, next) => {
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
        : await deps.db
            .select()
            .from(schema.posts)
            .orderBy(desc(schema.posts.createdAt))
            .limit(limit);

      res.json({ posts: rows });
    } catch (err) {
      next(err);
    }
  });

  app.get("/posts/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const [post] = await deps.db
        .select()
        .from(schema.posts)
        .where(eq(schema.posts.id, id))
        .limit(1);
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

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[api]", err.stack ?? err);
    res.status(500).json({ error: "internal_error", message: err.message });
  });

  return app;
}
