"use client";

/**
 * Local "badge purse" — stores every badge the user has claimed plus a
 * pointer to which one they're posting under right now.
 *
 * The schema bumped to v2 when we went multi-badge; v1 was a single
 * StoredBadge object under "blindsol.badge". loadPurse() transparently
 * migrates v1 → v2 the first time it runs so existing users keep their
 * claimed badge.
 */

const KEY = "blindsol.badges.v2";
const LEGACY_KEY = "blindsol.badge";

export interface StoredBadge {
  badgeId: string;
  kind: string;
  label: string;
  badgeToken: string;
  expiresAt: number;
  /** Server-derived anon for this badge. Optional for legacy stored
   *  badges that pre-date the field — components fall back to the badge
   *  token's signed payload when missing. */
  anonId?: string;
}

export interface BadgePurse {
  badges: StoredBadge[];
  activeId: string | null;
}

const EMPTY: BadgePurse = { badges: [], activeId: null };

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function dropExpired(p: BadgePurse): BadgePurse {
  const now = nowSeconds();
  const live = p.badges.filter((b) => b.expiresAt > now);
  if (live.length === p.badges.length && p.activeId && live.some((b) => b.badgeId === p.activeId)) {
    return p;
  }
  const activeId = live.some((b) => b.badgeId === p.activeId) ? p.activeId : (live[0]?.badgeId ?? null);
  return { badges: live, activeId };
}

function migrateFromLegacy(): BadgePurse | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredBadge;
    window.localStorage.removeItem(LEGACY_KEY);
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt <= nowSeconds()) return EMPTY;
    return { badges: [parsed], activeId: parsed.badgeId };
  } catch {
    window.localStorage.removeItem(LEGACY_KEY);
    return null;
  }
}

export function loadPurse(): BadgePurse {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) {
    const migrated = migrateFromLegacy();
    if (migrated) {
      savePurse(migrated);
      return migrated;
    }
    return EMPTY;
  }
  try {
    const parsed = JSON.parse(raw) as BadgePurse;
    if (!Array.isArray(parsed.badges)) return EMPTY;
    const cleaned = dropExpired(parsed);
    if (cleaned !== parsed) savePurse(cleaned);
    return cleaned;
  } catch {
    window.localStorage.removeItem(KEY);
    return EMPTY;
  }
}

export function savePurse(p: BadgePurse): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(p));
}

export function clearPurse(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.localStorage.removeItem(LEGACY_KEY);
}

/**
 * Add (or replace by `kind`) a badge into the purse and make it active.
 * Re-claiming the same kind supersedes the older entry — important when
 * a token has been renewed after expiry.
 */
export function purseAdd(p: BadgePurse, b: StoredBadge): BadgePurse {
  const without = p.badges.filter((existing) => existing.kind !== b.kind);
  return { badges: [b, ...without], activeId: b.badgeId };
}

export function purseRemove(p: BadgePurse, badgeId: string): BadgePurse {
  const remaining = p.badges.filter((b) => b.badgeId !== badgeId);
  const activeId =
    p.activeId === badgeId ? (remaining[0]?.badgeId ?? null) : p.activeId;
  return { badges: remaining, activeId };
}

export function purseSetActive(p: BadgePurse, badgeId: string): BadgePurse {
  if (!p.badges.some((b) => b.badgeId === badgeId)) return p;
  return { ...p, activeId: badgeId };
}

export function purseActive(p: BadgePurse): StoredBadge | null {
  if (!p.activeId) return p.badges[0] ?? null;
  return p.badges.find((b) => b.badgeId === p.activeId) ?? p.badges[0] ?? null;
}
