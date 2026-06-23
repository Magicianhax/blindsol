"use client";

import Link from "next/link";
import { useState } from "react";
import { ConnectButton } from "./connect-button";
import { ClaimDialog } from "./claim-dialog";
import { BadgeSwitcher } from "./badge-switcher";
import { ThemeToggle } from "./theme-toggle";
import { SearchDropdown } from "./search-dropdown";
import { useBadge } from "./badge-context";

interface TopNavProps {
  /** Kept for call-site compatibility; the bar no longer renders inline nav. */
  active?: "home" | "trending" | "about" | "profile";
}

export function TopNav(_props: TopNavProps) {
  const { badges } = useBadge();
  const [claiming, setClaiming] = useState(false);

  return (
    <>
      <header className="scribble-header">
        <div className="mx-auto flex h-full max-w-[748px] items-center gap-3 px-3 sm:px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <Logo />
            <span className="text-[16px] font-semibold leading-none tracking-tight">
              blind<span className="text-acid">sol</span>
            </span>
          </Link>

          <div className="ml-1 hidden min-w-0 flex-1 md:block">
            <SearchDropdown />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {badges.length > 0 ? (
              <BadgeSwitcher onClaimMore={() => setClaiming(true)} />
            ) : (
              <button
                onClick={() => setClaiming(true)}
                className="scribble-btn scribble-btn--primary px-3 py-1.5 text-[13px]"
              >
                <span className="hidden sm:inline">Claim a badge</span>
                <span className="sm:hidden">Claim</span>
              </button>
            )}
            <span className="hidden sm:inline-flex">
              <ThemeToggle />
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Mobile-only search row */}
      <div className="border-b border-line bg-bg px-3 py-2 md:hidden">
        <SearchDropdown />
      </div>

      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </>
  );
}

function Logo() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/blindSOL.png"
      alt="BlindSol"
      width={26}
      height={26}
      className="h-[26px] w-[26px] shrink-0 select-none"
      draggable={false}
    />
  );
}
