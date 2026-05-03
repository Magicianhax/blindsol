"use client";

import { useEffect } from "react";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  children: React.ReactNode;
}

/**
 * Slide-in drawer used to host the sidebar on small screens. Closes on
 * backdrop tap, the Escape key, and (in the parent) on route change. Body
 * scroll is locked while open so the page underneath doesn't wiggle.
 */
export function MobileDrawer({ open, onClose, side = "left", children }: MobileDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="md:hidden">
      <div className="drawer-backdrop" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        className={side === "right" ? "drawer-panel drawer-panel--right" : "drawer-panel"}
      >
        {children}
      </aside>
    </div>
  );
}
