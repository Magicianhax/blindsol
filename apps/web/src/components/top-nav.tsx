"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectButton } from "./connect-button";
import { ClaimDialog } from "./claim-dialog";
import { BadgeSwitcher } from "./badge-switcher";
import { ThemeToggle } from "./theme-toggle";
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
        <div className="mx-auto flex h-full max-w-[1280px] items-center gap-3 px-3 sm:gap-4 sm:px-5">
          {onOpenMenu && (
            <button
              type="button"
              onClick={onOpenMenu}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-line text-text-2 transition hover:border-acid hover:text-acid md:hidden"
              aria-label="Open navigation menu"
            >
              <HamburgerIcon />
            </button>
          )}

          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-mono text-[15px] font-semibold leading-none tracking-tight">
              blind<span className="text-acid">sol</span>
            </span>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-muted sm:inline">
              v0.1 · mainnet beta
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-1 md:flex">
            <NavLink href="/" active={active === "home"}>feed</NavLink>
            <NavLink href="/?sort=top" active={active === "trending"}>trending</NavLink>
            <NavLink href="/about" active={active === "about"}>how it works</NavLink>
            {activeBadge?.anonId ? (
              <NavLink href={`/u/${activeBadge.anonId}`} active={!!profileActive}>
                profile
              </NavLink>
            ) : null}
          </nav>

          <div className="ml-2 hidden flex-1 max-w-md md:block">
            <SearchBar value={search} onChange={onSearch} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {badges.length > 0 ? (
              <BadgeSwitcher onClaimMore={() => setClaiming(true)} />
            ) : (
              <button
                onClick={() => setClaiming(true)}
                className="scribble-btn scribble-btn--primary"
              >
                <span className="hidden sm:inline">claim a badge</span>
                <span className="sm:hidden">claim</span>
              </button>
            )}
            {/* Theme toggle hidden on phones — surfaced in the bottom-tab
                menu later. Keeping the top bar compact on small screens. */}
            <span className="hidden sm:inline-flex">
              <ThemeToggle />
            </span>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Mobile-only search row */}
      <div className="border-b border-line bg-bg px-3 py-2 md:hidden">
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
      className={`relative inline-flex items-center rounded px-3 py-1.5 font-mono text-[12px] uppercase leading-none tracking-[0.06em] transition ${
        active
          ? "border border-acid-line bg-bg-3 text-acid"
          : "border border-transparent text-text-2 hover:text-acid"
      }`}
    >
      {children}
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
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="search threads, $TICKER, @handle"
        className="scribble-input w-full"
        style={{ paddingLeft: 36, fontSize: 12 }}
      />
    </div>
  );
}

function Logo() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src="/blindSOL.png"
      alt="BlindSol"
      width={28}
      height={28}
      className="h-7 w-7 shrink-0 select-none"
      draggable={false}
    />
  );
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="6" r="2.5" />
      <path d="M3 14 Q3 9.5 8 9.5 Q13 9.5 13 14" strokeLinecap="round" />
    </svg>
  );
}
