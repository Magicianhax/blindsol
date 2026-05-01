"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { type StoredBadge, clearBadge as clearStored, loadBadge, saveBadge } from "@/lib/badge-storage";

interface BadgeContextValue {
  badge: StoredBadge | null;
  setBadge: (b: StoredBadge | null) => void;
  clear: () => void;
}

const BadgeContext = createContext<BadgeContextValue | undefined>(undefined);

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [badge, setBadgeState] = useState<StoredBadge | null>(null);

  useEffect(() => {
    setBadgeState(loadBadge());
  }, []);

  const setBadge = useCallback((b: StoredBadge | null) => {
    if (b) saveBadge(b);
    else clearStored();
    setBadgeState(b);
  }, []);

  const clear = useCallback(() => setBadge(null), [setBadge]);

  return <BadgeContext.Provider value={{ badge, setBadge, clear }}>{children}</BadgeContext.Provider>;
}

export function useBadge(): BadgeContextValue {
  const ctx = useContext(BadgeContext);
  if (!ctx) throw new Error("useBadge must be used inside <BadgeProvider>");
  return ctx;
}
