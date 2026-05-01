import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { BadgeIssuanceError, BadgeIssuer, getBadgeById } from "../per/issuer.js";
import { BADGE_LABELS, type BadgeKind } from "../per/evidence.js";

export interface BadgeRouterDeps {
  issuer: BadgeIssuer;
  db: import("../db/index.js").DB;
}

const claimBody = z.object({
  wallet: z.string().min(32).max(44),
  kind: z.enum(["jup_holder", "sol_foundation", "anthropic_eng"]),
  challenge: z.string().min(8).max(256),
  signature: z.string().min(64).max(128),
});

export function badgesRouter(deps: BadgeRouterDeps): ExpressRouter {
  const router = Router();

  router.get("/challenge", (req, res) => {
    const wallet = typeof req.query.wallet === "string" ? req.query.wallet : "";
    if (wallet.length < 32) {
      res.status(400).json({ error: "missing_wallet" });
      return;
    }
    const nonce = Math.random().toString(36).slice(2);
    const challenge = `BlindSol badge claim — wallet ${wallet} — nonce ${nonce} — ts ${Math.floor(
      Date.now() / 1000,
    )}`;
    res.json({ challenge });
  });

  router.post("/claim", async (req, res, next) => {
    try {
      const parsed = claimBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }
      const result = await deps.issuer.issue({
        walletBase58: parsed.data.wallet,
        kind: parsed.data.kind as BadgeKind,
        challenge: parsed.data.challenge,
        signatureBase58: parsed.data.signature,
      });
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof BadgeIssuanceError) {
        res.status(400).json({ error: "claim_rejected", reason: err.reason });
        return;
      }
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const badge = await getBadgeById(deps.db, req.params.id);
      if (!badge) {
        res.status(404).json({ error: "badge_not_found" });
        return;
      }
      const kind = badge.kind as BadgeKind;
      res.json({
        ...badge,
        label: BADGE_LABELS[kind] ?? badge.kind,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
