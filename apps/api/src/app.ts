import express, { type Express } from "express";
import { desc, eq } from "drizzle-orm";
import { type DB, schema } from "./db/index.js";

export interface AppDeps {
  db: DB;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "blindsol-api" });
  });

  app.get("/posts", async (req, res, next) => {
    try {
      const badge = typeof req.query.badge === "string" ? req.query.badge : undefined;
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 100);

      const baseQuery = deps.db
        .select()
        .from(schema.posts)
        .orderBy(desc(schema.posts.createdAt))
        .limit(limit);

      const rows = await (badge ? baseQuery.where(eq(schema.posts.badgeKind, badge)) : baseQuery);
      res.json({ posts: rows });
    } catch (err) {
      next(err);
    }
  });

  app.get("/posts/:id", async (req, res, next) => {
    try {
      const id = req.params.id;
      const post = await deps.db.query.posts.findFirst({ where: eq(schema.posts.id, id) });
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
    console.error("[api]", err);
    res.status(500).json({ error: "internal_error", message: err.message });
  });

  return app;
}
