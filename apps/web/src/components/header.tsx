"use client";

import Link from "next/link";
import { useState } from "react";
import { ConnectButton } from "./connect-button";
import { ClaimDialog } from "./claim-dialog";
import { useBadge } from "./badge-context";

export function Header() {
  const { badge, clear } = useBadge();
  const [claiming, setClaiming] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          BlindSol
        </Link>
        <span className="hidden text-xs text-muted sm:inline">anonymous gossip for crypto</span>
        <div className="ml-auto flex items-center gap-2">
          {badge ? (
            <button
              onClick={clear}
              title="Clear badge (sign out anonymously)"
              className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs font-mono hover:border-accent hover:text-accent"
            >
              {badge.label} ✓
            </button>
          ) : (
            <button
              onClick={() => setClaiming(true)}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent/80"
            >
              Claim badge
            </button>
          )}
          <ConnectButton />
        </div>
      </div>
      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </header>
  );
}
