"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { ClaimDialog } from "./claim-dialog";
import { useBadge } from "./badge-context";
import { TokenIcon } from "./token-icon";
import { HoloSeal } from "./holo-seal";
import { TOKENS, TOKEN_KINDS, tokenFor } from "@/lib/tokens";

type TabId = "feed" | "tokens" | "post" | "purse" | "me";

/**
 * Bottom-tab navigation rendered on every page on mobile. Five slots
 * matching the design's pattern. Tabs adapt to the user's auth state
 * (post / purse / me surface a login or claim CTA when prerequisites
 * aren't met) and surface real content via bottom-sheets for screens
 * that don't have dedicated routes yet (tokens, purse).
 */
export function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { authenticated, login, ready } = usePrivy();
  const { badges, active: activeBadge, setActive } = useBadge();
  const [claiming, setClaiming] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [showPurse, setShowPurse] = useState(false);

  const hasBadge = badges.length > 0;
  const profileHref = activeBadge?.anonId ? `/u/${activeBadge.anonId}` : null;

  const current: TabId = pathname.startsWith("/u/")
    ? "me"
    : pathname.startsWith("/about")
    ? "feed"
    : "feed";

  const requireConnect = () => {
    if (!ready) return;
    login();
  };
  const requireBadge = () => setClaiming(true);

  const onTokens = () => setShowTokens(true);

  const onPost = () => {
    if (!authenticated) return requireConnect();
    if (!hasBadge) return requireBadge();
    router.push("/");
  };

  const onPurse = () => {
    if (!authenticated) return requireConnect();
    if (!hasBadge) return requireBadge();
    setShowPurse(true);
  };

  const onMe = () => {
    if (!authenticated) return requireConnect();
    if (!profileHref) return requireBadge();
    router.push(profileHref);
  };

  return (
    <>
      <nav className="mobile-tab-bar md:hidden">
        <TabLink id="feed" current={current} href="/" label="feed" icon={<FeedIcon />} />
        <TabButton
          id="tokens"
          current={showTokens ? "tokens" : current}
          label="tokens"
          icon={<HashIcon />}
          onClick={onTokens}
        />
        <PostTab onClick={onPost} />
        <TabButton
          id="purse"
          current={showPurse ? "purse" : current}
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

      {showTokens && (
        <TokensSheet
          onClose={() => setShowTokens(false)}
          onPick={(kind) => {
            setShowTokens(false);
            router.push(`/?filter=${kind}`);
          }}
        />
      )}

      {showPurse && (
        <PurseSheet
          onClose={() => setShowPurse(false)}
          onSwitch={(badgeId) => {
            setActive(badgeId);
            setShowPurse(false);
          }}
          onClaimMore={() => {
            setShowPurse(false);
            setClaiming(true);
          }}
        />
      )}
    </>
  );
}

/* ─── Tabs ─── */

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

/* ─── Sheets ─── */

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-h-[80vh] overflow-hidden rounded-t-xl border-t border-line bg-bg-2"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "max(72px, env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-mono text-[14px] uppercase tracking-[0.08em] text-text">{title}</h2>
          <button
            onClick={onClose}
            aria-label="close"
            className="rounded border border-line p-1.5 text-text-2 transition hover:border-acid hover:text-acid"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 60px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function TokensSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (kind: string) => void;
}) {
  return (
    <Sheet title="all tokens" onClose={onClose}>
      <ul className="divide-y divide-line">
        {TOKEN_KINDS.map((kind) => {
          const meta = TOKENS[kind]!;
          return (
            <li key={kind}>
              <button
                onClick={() => onPick(kind)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-bg-3"
              >
                <TokenIcon kind={kind} size={28} />
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="font-mono text-[14px] text-text">${meta.symbol}</div>
                  <div className="truncate font-mono text-[11px] text-muted">{meta.label}</div>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-2">
                  open →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function PurseSheet({
  onClose,
  onSwitch,
  onClaimMore,
}: {
  onClose: () => void;
  onSwitch: (badgeId: string) => void;
  onClaimMore: () => void;
}) {
  const { badges, active } = useBadge();
  return (
    <Sheet title="badge purse" onClose={onClose}>
      {badges.length === 0 ? (
        <div className="px-4 py-8 text-center font-mono text-[12px] text-muted">
          no badges yet. claim one to start posting.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {badges.map((b) => {
            const meta = tokenFor(b.kind);
            const isActive = active?.badgeId === b.badgeId;
            return (
              <li key={b.badgeId}>
                <button
                  onClick={() => onSwitch(b.badgeId)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                    isActive ? "bg-acid-soft" : "hover:bg-bg-3"
                  }`}
                >
                  <HoloSeal hash={b.anonId ?? b.kind} size={32} animate={isActive} />
                  <div className="flex-1 min-w-0 leading-tight">
                    <div className={`font-mono text-[14px] ${isActive ? "text-acid" : "text-text"}`}>
                      ${meta?.symbol ?? b.kind}
                    </div>
                    <div className="truncate font-mono text-[10px] text-muted-2">
                      {b.anonId ?? b.kind}
                    </div>
                  </div>
                  {isActive && (
                    <span className="rounded border border-acid-line bg-acid-soft px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-acid">
                      active
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line p-3">
        <button
          onClick={onClaimMore}
          className="scribble-btn scribble-btn--primary w-full justify-center"
        >
          + claim another badge
        </button>
      </div>
    </Sheet>
  );
}

/* ─── Icons ─── */

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
function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}
