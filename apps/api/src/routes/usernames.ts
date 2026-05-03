import { Router, type Request, type Response, type Router as ExpressRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { type DB, schema } from "../db/index.js";
import { authBearerBadge } from "../per/session.js";
import { deriveAuthorAnonId } from "../per/anon.js";

export interface UsernamesRouterDeps {
  db: DB;
  perPubkeyBase58: string;
}

/**
 * Username validation:
 *   - 3–20 chars
 *   - a-z, 0-9, underscore (no caps; we lowercase before storing)
 *   - no leading underscore (prevents confusables)
 *
 * Reserved-name list intentionally short for now. Add project founder
 * handles, brand names, and known confusables here over time.
 */
const RESERVED = new Set<string>([
  "blindsol",
  "admin",
  "system",
  "anonymous",
  "support",
  "moderator",
  "official",
]);

const usernamePattern = /^[a-z0-9][a-z0-9_]{2,19}$/;
const usernameSchema = z
  .string()
  .min(3)
  .max(20)
  .transform((s) => s.toLowerCase().trim())
  .refine((s) => usernamePattern.test(s), { message: "must be 3-20 chars, [a-z0-9_], can't start with _" })
  .refine((s) => !RESERVED.has(s), { message: "reserved name" });

const claimBody = z.object({ username: usernameSchema });

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

export function usernamesRouter(deps: UsernamesRouterDeps): ExpressRouter {
  const router = Router();

  /**
   * Public uniqueness check. Returns whether the name is available without
   * leaking anything beyond yes/no — the same info you'd get by attempting
   * to claim. No auth needed because the response is already public-equivalent.
   */
  router.get("/available", async (req, res, next) => {
    try {
      const raw = typeof req.query.name === "string" ? req.query.name : "";
      const parsed = usernameSchema.safeParse(raw);
      if (!parsed.success) {
        res.status(200).json({
          available: false,
          reason: parsed.error.issues[0]?.message ?? "invalid_format",
        });
        return;
      }
      const name = parsed.data;
      const [hit] = await deps.db
        .select({ id: schema.usernames.id })
        .from(schema.usernames)
        .where(eq(schema.usernames.username, name))
        .limit(1);
      res.status(200).json({ available: !hit, normalized: name });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Claim a username for the active badge's anon_id. Authenticated via the
   * badge bearer token — server derives `anon_id` from the token (never
   * trusts a client-supplied anon).
   */
  router.post("/", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;

      const parsed = claimBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
        return;
      }
      const username = parsed.data.username;
      const anonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);

      try {
        const [inserted] = await deps.db
          .insert(schema.usernames)
          .values({ username, anonId, badgeKind: session.token.kind })
          .returning();
        if (!inserted) throw new Error("insert returned no row");
        res.status(201).json({ username: inserted.username, anonId, badgeKind: inserted.badgeKind });
      } catch (err) {
        // 23505 = unique violation. The pair of unique indexes maps cleanly:
        //   uq_usernames_username — name already taken
        //   uq_usernames_anon     — this anon already has a name
        const message = (err as { message?: string }).message ?? "";
        if (message.includes("uq_usernames_username") || message.includes("usernames_username_unique")) {
          res.status(409).json({ error: "username_taken" });
          return;
        }
        if (message.includes("uq_usernames_anon")) {
          res.status(409).json({ error: "already_has_username", reason: "release current name first" });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  /** Release the active badge's username. Auth'd. */
  router.delete("/", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;
      const anonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);

      const deleted = await deps.db
        .delete(schema.usernames)
        .where(eq(schema.usernames.anonId, anonId))
        .returning({ username: schema.usernames.username });

      res.status(200).json({ released: deleted[0]?.username ?? null });
    } catch (err) {
      next(err);
    }
  });

  /** Mirror — the active badge's current username (or null if unset). */
  router.get("/me", async (req, res, next) => {
    try {
      const session = authOrRespond(req, res, deps.perPubkeyBase58);
      if (!session) return;
      const anonId = deriveAuthorAnonId(session.token.anonSeed, session.token.kind);

      const [row] = await deps.db
        .select({ username: schema.usernames.username })
        .from(schema.usernames)
        .where(eq(schema.usernames.anonId, anonId))
        .limit(1);
      res.status(200).json({ username: row?.username ?? null, anonId });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
