"use client";

import Link from "next/link";
import { useState } from "react";
import { ConnectButton } from "./connect-button";
import { ClaimDialog } from "./claim-dialog";
import { BadgeSwitcher } from "./badge-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SearchDropdown } from "./search-dropdown";
import { Seal } from "./seal";
import { Brand } from "./brand";
import { useBadge } from "./badge-context";

interface TopNavProps {
  /** Kept for call-site compatibility; the bar no longer renders inline nav. */
  active?: "home" | "trending" | "about" | "profile";
}

/**
 * Editorial top bar: serif wordmark · search · "+ new thread" · theme toggle ·
 * badge switcher / claim · wallet · seal ident chip (links to the profile).
 */
export function TopNav(_props: TopNavProps) {
  const { badges, active } = useBadge();
  const [claiming, setClaiming] = useState(false);

  return (
    <>
      <header className="top">
        <div className="in">
          <Brand />

          <div className="hidden min-w-0 flex-1 md:flex">
            <SearchDropdown />
          </div>
          <span className="spacer md:hidden" />

          <Link href="/forum?compose=1" className="newb">
            + new thread
          </Link>
          <ThemeToggle />

          {badges.length > 0 ? (
            <BadgeSwitcher onClaimMore={() => setClaiming(true)} />
          ) : (
            <button onClick={() => setClaiming(true)} className="newb newb--outline">
              claim a badge
            </button>
          )}

          <ConnectButton />

          {active?.anonId && (
            <span className="ident">
              <Link className="identlink" href={`/u/${active.anonId}`}>
                <Seal hash={active.anonId} size={22} />
                <span className="myid">{active.anonId}</span>
              </Link>
            </span>
          )}
        </div>
      </header>

      {/* Mobile-only search row */}
      <div className="border-b border-line bg-bg px-4 py-2 md:hidden">
        <SearchDropdown />
      </div>

      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </>
  );
}
