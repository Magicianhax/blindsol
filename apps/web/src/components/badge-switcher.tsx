"use client";

import { useEffect, useRef, useState } from "react";
import { TokenIcon } from "./token-icon";
import { useBadge } from "./badge-context";
import { tokenFor } from "@/lib/tokens";

interface BadgeSwitcherProps {
  /** Called when the user clicks "claim another" so the parent can open ClaimDialog. */
  onClaimMore: () => void;
}

/**
 * Header pill that shows the active badge plus a dropdown of every other
 * badge in the user's purse. Empty-state hides itself; the parent renders
 * a Claim CTA in that case.
 */
export function BadgeSwitcher({ onClaimMore }: BadgeSwitcherProps) {
  const { badges, active, setActive, removeBadge } = useBadge();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const closeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeKey);
    };
  }, [open]);

  if (!active) return null;
  const activeMeta = tokenFor(active.kind);
  const activeSymbol = activeMeta?.symbol ?? active.kind;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="scribble-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        title="switch badge"
      >
        <TokenIcon kind={active.kind} size={22} />
        <span>${activeSymbol}</span>
        {badges.length > 1 && (
          <span className="ml-0.5 rounded-full bg-ink px-1.5 py-0.5 font-mono text-[10px] leading-none text-paper">
            {badges.length}
          </span>
        )}
        <span className="text-muted">⌄</span>
      </button>

      {open && (
        <div
          role="menu"
          className="scribble-card wobble-in absolute right-0 top-full z-40 mt-2 w-[min(280px,calc(100vw-24px))] p-2 text-left"
        >
          <div className="px-2 pb-1.5 font-display text-sm uppercase tracking-wider text-muted">
            your badge purse ({badges.length})
          </div>
          <ul className="flex flex-col gap-1">
            {badges.map((b) => {
              const meta = tokenFor(b.kind);
              const symbol = meta?.symbol ?? b.kind;
              const isActive = b.badgeId === active.badgeId;
              return (
                <li key={b.badgeId}>
                  <div
                    className={`flex items-center gap-2 rounded-lg border-2 p-1.5 transition ${
                      isActive
                        ? "border-ink bg-crayon-yellow shadow-pen-sm"
                        : "border-dashed border-transparent hover:border-ink hover:bg-surface-2"
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActive(b.badgeId);
                        setOpen(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <TokenIcon kind={b.kind} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="font-display text-base leading-none text-ink">${symbol}</div>
                        <div className="text-[10px] text-muted">
                          {isActive ? "posting as this" : "tap to switch"}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => removeBadge(b.badgeId)}
                      title="remove badge"
                      className="rounded-full p-1 text-muted transition hover:bg-paper hover:text-crayon-red"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            onClick={() => {
              setOpen(false);
              onClaimMore();
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-ink px-3 py-1.5 font-display text-base text-ink transition hover:bg-crayon-yellow"
          >
            + claim another badge
          </button>
        </div>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}
