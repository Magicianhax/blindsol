"use client";

const KEY = "blindsol.badge";

export interface StoredBadge {
  badgeId: string;
  kind: string;
  label: string;
  badgeToken: string;
  expiresAt: number;
}

export function loadBadge(): StoredBadge | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredBadge;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(KEY);
    return null;
  }
}

export function saveBadge(b: StoredBadge): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(b));
}

export function clearBadge(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
