"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  type BadgePurse,
  type StoredBadge,
  clearPurse,
  loadPurse,
  purseActive,
  purseAdd,
  purseRemove,
  purseSetActive,
  savePurse,
} from "@/lib/badge-storage";

interface BadgeContextValue {
  /** Every claimed (non-expired) badge in the user's purse. */
  badges: StoredBadge[];
  /** The badge being used right now for posts/comments/reactions. */
  active: StoredBadge | null;
  /**
   * Backwards-compat alias for `active`. Older code reads `badge` directly;
   * keeping this means we don't have to touch every call site at once.
   */
  badge: StoredBadge | null;

  addBadge: (b: StoredBadge) => void;
  setActive: (badgeId: string) => void;
  removeBadge: (badgeId: string) => void;

  /** Remove the currently active badge. If others exist the next one becomes active. */
  clear: () => void;
  /** Wipe the whole purse. Used for "log out" type flows. */
  clearAll: () => void;
}

const BadgeContext = createContext<BadgeContextValue | undefined>(undefined);

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [purse, setPurse] = useState<BadgePurse>({ badges: [], activeId: null });

  useEffect(() => {
    setPurse(loadPurse());
  }, []);

  const update = useCallback((next: BadgePurse) => {
    savePurse(next);
    setPurse(next);
  }, []);

  const addBadge = useCallback((b: StoredBadge) => update(purseAdd(purse, b)), [purse, update]);
  const removeBadge = useCallback((id: string) => update(purseRemove(purse, id)), [purse, update]);
  const setActive = useCallback((id: string) => update(purseSetActive(purse, id)), [purse, update]);

  const clear = useCallback(() => {
    if (!purse.activeId) return;
    update(purseRemove(purse, purse.activeId));
  }, [purse, update]);

  const clearAll = useCallback(() => {
    clearPurse();
    setPurse({ badges: [], activeId: null });
  }, []);

  const active = useMemo(() => purseActive(purse), [purse]);

  const value: BadgeContextValue = {
    badges: purse.badges,
    active,
    badge: active,
    addBadge,
    setActive,
    removeBadge,
    clear,
    clearAll,
  };

  return <BadgeContext.Provider value={value}>{children}</BadgeContext.Provider>;
}

export function useBadge(): BadgeContextValue {
  const ctx = useContext(BadgeContext);
  if (!ctx) throw new Error("useBadge must be used inside <BadgeProvider>");
  return ctx;
}
