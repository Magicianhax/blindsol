"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "./connect-button";
import { ClaimDialog } from "./claim-dialog";
import { BadgeSwitcher } from "./badge-switcher";
import { useBadge } from "./badge-context";

interface TopNavProps {
  search?: string;
  onSearch?: (q: string) => void;
  active?: "home" | "trending" | "about" | "profile";
  /** When provided, a hamburger button appears on mobile that opens this. */
  onOpenMenu?: () => void;
}

export function TopNav({ search, onSearch, active, onOpenMenu }: TopNavProps) {
  const { badges, active: activeBadge } = useBadge();
  const [claiming, setClaiming] = useState(false);
  const pathname = usePathname();
  const profileActive = active === "profile" || pathname?.startsWith("/u/");

  return (
    <>
      <header className="scribble-header">
        <div className="mx-auto flex h-full max-w-[1180px] items-center gap-2 px-3 sm:gap-4 sm:px-4">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-paper shadow-pen-sm md:hidden"
              aria-label="Open navigation menu"
            >
              <HamburgerIcon />
            </button>
          )}

          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-2xl leading-none sm:text-3xl">BlindSol</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            <NavLink href="/" active={active === "home"}>Home</NavLink>
            <NavLink href="/?sort=top" active={active === "trending"}>Trending</NavLink>
            <NavLink href="/about" active={active === "about"}>About</NavLink>
            {activeBadge?.anonId ? (
              <NavLink href={`/u/${activeBadge.anonId}`} active={!!profileActive}>
                Profile
              </NavLink>
            ) : null}
          </nav>

          <div className="ml-2 hidden flex-1 max-w-md md:block">
            <SearchBar value={search} onChange={onSearch} />
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {/* Mobile-only profile shortcut. Desktop has the same link in
                the nav above; on small screens the nav is hidden so we
                surface a one-tap chip next to the badge pill. */}
            {activeBadge?.anonId ? (
              <Link
                href={`/u/${activeBadge.anonId}`}
                aria-label="Your profile"
                className="scribble-chip md:hidden"
                title="Your profile"
              >
                <ProfileIcon />
              </Link>
            ) : null}
            {badges.length > 0 ? (
              <BadgeSwitcher onClaimMore={() => setClaiming(true)} />
            ) : (
              <button
                onClick={() => setClaiming(true)}
                className="scribble-btn scribble-btn--yellow text-sm sm:text-base"
              >
                <span className="hidden sm:inline">Claim a badge</span>
                <span className="sm:hidden">Claim</span>
              </button>
            )}
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Mobile-only search row sits underneath the header. We keep it
          outside .scribble-header so the sticky height doesn't grow. */}
      <div className="border-b-2 border-dashed border-border-soft bg-bg px-3 py-2 md:hidden">
        <SearchBar value={search} onChange={onSearch} />
      </div>

      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative rounded px-3 py-1 font-display text-xl leading-none transition ${
        active ? "text-ink" : "text-muted hover:text-ink"
      }`}
    >
      <span className={active ? "scribble-underline" : ""}>{children}</span>
    </Link>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (q: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="search threads, anons, $tokens…"
        className="scribble-input w-full"
        style={{ paddingLeft: 40 }}
      />
    </div>
  );
}

function Logo() {
  return (
    <img
      src="/blindSOL.png"
      alt="BlindSol"
      width={56}
      height={56}
      className="h-9 w-9 select-none sm:h-12 sm:w-12 md:h-14 md:w-14"
      draggable={false}
    />
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1-4.5 4.5-7 8-7s7 2.5 8 7" strokeLinecap="round" />
    </svg>
  );
}
