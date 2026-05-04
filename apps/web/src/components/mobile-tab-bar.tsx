"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { ClaimDialog } from "./claim-dialog";
import { useBadge } from "./badge-context";

type TabId = "feed" | "tokens" | "post" | "purse" | "me";

/**
 * Bottom-tab navigation rendered on every page on mobile. Five slots
 * matching the design's pattern. Tabs adapt to the user's auth state:
 *   - "post" / "purse" / "me" surface a login or claim CTA when the
 *     prerequisite isn't met, instead of a dead-end navigation.
 *   - "feed" and "tokens" always navigate.
 *
 * Mounted globally in the root layout so it persists across page transitions.
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { authenticated, login, ready } = usePrivy();
  const { badges, active: activeBadge } = useBadge();
  const [claiming, setClaiming] = useState(false);

  const hasBadge = badges.length > 0;

  // Map current pathname to a logical tab id so the active highlight is
  // consistent regardless of which screen the user is on.
  const current: TabId = pathname.startsWith("/u/")
    ? "me"
    : pathname.startsWith("/about")
    ? "tokens"
    : "feed";

  const profileHref = activeBadge?.anonId ? `/u/${activeBadge.anonId}` : null;

  // CTA triggers — surfaced as the action on tabs that need an authed user
  // or a claimed badge. Kept inline so each tab can pick the right one.
  const requireConnect = () => {
    if (!ready) return;
    login();
  };
  const requireBadge = () => setClaiming(true);

  /** "post" — needs both a wallet connection AND a badge to compose. */
  const onPost = () => {
    if (!authenticated) return requireConnect();
    if (!hasBadge) return requireBadge();
    router.push("/");
  };

  /** "purse" — needs a badge. Without one, prompt to claim. */
  const onPurse = () => {
    if (!authenticated) return requireConnect();
    if (!hasBadge) return requireBadge();
    // No dedicated /purse screen yet — bouncing home so the user
    // lands in a known-good state with their badges visible.
    router.push("/");
  };

  /** "me" — without a badge there is no profile to show. */
  const onMe = () => {
    if (!authenticated) return requireConnect();
    if (!profileHref) return requireBadge();
    router.push(profileHref);
  };

  return (
    <>
      <nav className="mobile-tab-bar md:hidden">
        <TabLink id="feed" current={current} href="/" label="feed" icon={<FeedIcon />} />
        <TabLink id="tokens" current={current} href="/about" label="tokens" icon={<HashIcon />} />
        <PostTab onClick={onPost} />
        <TabButton
          id="purse"
          current={current}
          label="purse"
          icon={<BagIcon />}
          onClick={onPurse}
        />
        <MeTab
          current={current}
          authed={authenticated}
          hasBadge={hasBadge}
          onClick={onMe}
        />
      </nav>

      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </>
  );
}

function MeTab({
  current,
  authed,
  hasBadge,
  onClick,
}: {
  current: TabId;
  authed: boolean;
  hasBadge: boolean;
  onClick: () => void;
}) {
  // Different label depending on auth state so users understand what tapping
  // here will do, instead of seeing "me" with no actual profile to show.
  const label = !authed ? "login" : !hasBadge ? "claim" : "me";
  const active = current === "me" && hasBadge;
  const icon = !authed ? <PowerIcon /> : !hasBadge ? <PlusBadgeIcon /> : <UserIcon />;
  return (
    <button onClick={onClick} className={tabClass(active)}>
      <span className={iconWrapClass(active)}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function TabLink({
  id,
  current,
  href,
  label,
  icon,
}: {
  id: TabId;
  current: TabId;
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const active = current === id;
  return (
    <Link href={href} className={tabClass(active)}>
      <span className={iconWrapClass(active)}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

function TabButton({
  id,
  current,
  label,
  icon,
  onClick,
}: {
  id: TabId;
  current: TabId;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  const active = current === id;
  return (
    <button onClick={onClick} className={tabClass(active)}>
      <span className={iconWrapClass(active)}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function PostTab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 flex-col items-center gap-1 py-1.5 font-mono text-[9px] text-muted"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-acid bg-acid text-bg">
        <PlusIcon />
      </span>
      <span>post</span>
    </button>
  );
}

function tabClass(active: boolean) {
  return `flex flex-1 flex-col items-center gap-1 py-1.5 font-mono text-[9px] transition ${
    active ? "text-acid" : "text-muted hover:text-text"
  }`;
}
function iconWrapClass(active: boolean) {
  return `flex h-7 items-center justify-center ${active ? "text-acid" : "text-muted"}`;
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="3" y1="4" x2="13" y2="4" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" strokeLinecap="round" />
      <line x1="3" y1="12" x2="9" y2="12" strokeLinecap="round" />
    </svg>
  );
}
function HashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="6" y1="2" x2="4" y2="14" strokeLinecap="round" />
      <line x1="12" y1="2" x2="10" y2="14" strokeLinecap="round" />
      <line x1="2" y1="6" x2="14" y2="6" strokeLinecap="round" />
      <line x1="2" y1="10" x2="14" y2="10" strokeLinecap="round" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="3" x2="8" y2="13" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" strokeLinecap="round" />
    </svg>
  );
}
function BagIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6 H13 L12 14 H4 L3 6 Z" strokeLinejoin="round" />
      <path d="M5.5 6 V4.5 Q5.5 2.5 8 2.5 Q10.5 2.5 10.5 4.5 V6" strokeLinecap="round" />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="6" r="2.5" />
      <path d="M3 14 Q3 9.5 8 9.5 Q13 9.5 13 14" strokeLinecap="round" />
    </svg>
  );
}
function PowerIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5 4 Q2 6 2 9 Q2 13 8 13 Q14 13 14 9 Q14 6 11 4" strokeLinecap="round" />
      <line x1="8" y1="2" x2="8" y2="8" strokeLinecap="round" />
    </svg>
  );
}
function PlusBadgeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l3 1v3 c0 3-2 5-5 5.5 -3-.5-5-2.5-5-5.5V4l3-1z" strokeLinejoin="round" transform="translate(-2 0)" />
      <line x1="11" y1="6" x2="15" y2="6" strokeLinecap="round" />
      <line x1="13" y1="4" x2="13" y2="8" strokeLinecap="round" />
    </svg>
  );
}
