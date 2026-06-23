"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TokenIcon } from "./token-icon";
import { useBadge } from "./badge-context";
import { UsernameDialog } from "./username-dialog";
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
  const [usernameOpen, setUsernameOpen] = useState(false);
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
        className="scribble-chip h-8"
        aria-haspopup="menu"
        aria-expanded={open}
        title="switch badge"
      >
        <TokenIcon kind={active.kind} size={18} />
        <span>${activeSymbol}</span>
        {badges.length > 1 && (
          <span className="ml-0.5 rounded-full bg-acid px-1.5 py-0.5 font-numeric text-[10px] leading-none text-bg">
            {badges.length}
          </span>
        )}
        <ChevronIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-2 w-[min(280px,calc(100vw-24px))] rounded-xl border border-line bg-bg p-2 text-left shadow-md"
        >
          <div className="px-2 pb-1.5 text-sm font-semibold text-muted">
            Your badge purse ({badges.length})
          </div>
          <ul className="flex flex-col gap-1">
            {badges.map((b) => {
              const meta = tokenFor(b.kind);
              const symbol = meta?.symbol ?? b.kind;
              const isActive = b.badgeId === active.badgeId;
              return (
                <li key={b.badgeId}>
                  <div
                    className={`flex items-center gap-2 rounded-lg border p-1.5 transition ${
                      isActive
                        ? "border-acid-line bg-acid-soft"
                        : "border-transparent hover:bg-bg-2"
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
                        <div className="text-base font-semibold leading-none text-text">${symbol}</div>
                        <div className="text-[10px] text-muted">
                          {isActive ? "Posting as this" : "Tap to switch"}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => removeBadge(b.badgeId)}
                      title="Remove badge"
                      className="rounded-full p-1 text-muted transition hover:bg-bg-3 hover:text-danger"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {active.anonId ? (
            <Link
              href={`/u/${active.anonId}`}
              onClick={() => setOpen(false)}
              className="scribble-btn mt-2 w-full"
            >
              View profile →
            </Link>
          ) : null}
          <button
            onClick={() => {
              setOpen(false);
              setUsernameOpen(true);
            }}
            className="scribble-btn mt-1.5 w-full"
          >
            Pick a handle
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onClaimMore();
            }}
            className="scribble-btn mt-1.5 w-full"
          >
            + Claim another badge
          </button>
        </div>
      )}
      {usernameOpen && <UsernameDialog onClose={() => setUsernameOpen(false)} />}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 6 L8 10 L12 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}
