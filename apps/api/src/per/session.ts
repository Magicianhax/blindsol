import type { Request } from "express";
import { BadgeTokenError, type BadgeTokenPayload, verifyBadgeToken } from "./token.js";

const BEARER_PATTERN = /^Bearer\s+(.+)$/;

export interface AuthedSession {
  readonly token: BadgeTokenPayload;
}

export type AuthOutcome =
  | { kind: "ok"; session: AuthedSession }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string };

/**
 * Pull the badge token off `Authorization: Bearer ...` and verify it.
 * Returns a tagged outcome so route handlers can decide how to respond.
 */
export function authBearerBadge(req: Request, perPubkeyBase58: string): AuthOutcome {
  const auth = req.headers.authorization ?? "";
  const m = auth.match(BEARER_PATTERN);
  if (!m) return { kind: "missing" };
  const token = m[1]!;
  try {
    const payload = verifyBadgeToken(token, perPubkeyBase58);
    return { kind: "ok", session: { token: payload } };
  } catch (err) {
    if (err instanceof BadgeTokenError) return { kind: "invalid", reason: err.reason };
    throw err;
  }
}
