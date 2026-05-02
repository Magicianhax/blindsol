import express, { type Express } from "express";
import { type DB } from "./db/index.js";
import type { BadgeIssuer } from "./per/issuer.js";
import type { StakeBondPipeline } from "./posts/stake-bond.js";
import { badgesRouter } from "./routes/badges.js";
import { postsRouter } from "./routes/posts.js";

// Bigint columns (e.g. stake_lamports) come back from Postgres as JS bigints.
// JSON.stringify refuses bigints by default; serialize them as strings so
// large lamport values stay precise on the wire.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export interface AppDeps {
  db: DB;
  badgeIssuer?: BadgeIssuer;
  perPubkeyBase58: string;
  perSecretKey: Uint8Array;
  stakeBond?: StakeBondPipeline;
  rpcUrls?: { mainnet: string; badge: string };
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.use(express.json({ limit: "32kb" }));
  app.disable("x-powered-by");

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "blindsol-api",
      stakeBond: deps.stakeBond ? "enabled" : "disabled",
      rpc: deps.rpcUrls ?? null,
    });
  });

  if (deps.badgeIssuer) {
    app.use("/badges", badgesRouter({ issuer: deps.badgeIssuer, db: deps.db }));
  }

  app.use(
    "/posts",
    postsRouter({
      db: deps.db,
      perPubkeyBase58: deps.perPubkeyBase58,
      perSecretKey: deps.perSecretKey,
      ...(deps.stakeBond ? { stakeBond: deps.stakeBond } : {}),
    }),
  );

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[api]", err.stack ?? err);
    res.status(500).json({ error: "internal_error", message: err.message });
  });

  return app;
}
