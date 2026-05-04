"use client";

import { useMemo } from "react";
import { TokenIcon } from "./token-icon";
import { HoloSeal } from "./holo-seal";
import { useBadge } from "./badge-context";
import { TOKENS, TOKEN_KINDS, tokenFor, type TokenMeta } from "@/lib/tokens";

export type SortKind = "new" | "top";

interface LeftSidebarProps {
  active: string | undefined;
  onSelect: (kind: string | undefined) => void;
  sort: SortKind;
  onSort: (s: SortKind) => void;
  postCount: number;
  /** Auto-close drawer on mobile after a click. */
  onItemSelected?: () => void;
  /** Wrapper variant — `desktop` is the sticky rail, `drawer` is the slide-in. */
  variant?: "desktop" | "drawer";
  /** Optional setter to claim a new badge — opens the claim dialog. */
  onClaim?: () => void;
}

/**
 * Left rail for the desktop layout. Three panels matching the design spec:
 *   1. Feeds — home / trending / new
 *   2. Your Tokens — badges the user holds, with HoloSeal + active marker
 *   3. All Tokens — every supported token with a fake-but-plausible price
 *      and 24h change. Click filters the feed to that token.
 *
 * On mobile the same component is rendered inside the slide-in drawer.
 */
export function LeftSidebar({
  active,
  onSelect,
  sort,
  onSort,
  postCount,
  onItemSelected,
  variant = "desktop",
  onClaim,
}: LeftSidebarProps) {
  const { badges, active: activeBadge } = useBadge();

  const handleSelect = (kind: string | undefined) => {
    onSelect(kind);
    onItemSelected?.();
  };
  const handleSort = (s: SortKind) => {
    onSort(s);
    onItemSelected?.();
  };

  const Wrapper: React.FC<{ children: React.ReactNode }> =
    variant === "desktop"
      ? ({ children }) => <aside className="app-sidebar app-sidebar--desktop">{children}</aside>
      : ({ children }) => <div className="flex flex-col gap-4">{children}</div>;

  return (
    <Wrapper>
      <Panel title="feeds">
        <div className="flex flex-col">
          <RailRow
            label="home"
            icon={<FeedIcon />}
            active={active === undefined && sort === "new"}
            onClick={() => {
              handleSelect(undefined);
              handleSort("new");
            }}
            count={postCount}
          />
          <RailRow
            label="trending"
            icon={<FlameIcon />}
            active={sort === "top"}
            onClick={() => handleSort("top")}
          />
          <RailRow
            label="new"
            icon={<SparkIcon />}
            active={sort === "new" && active === undefined}
            onClick={() => {
              handleSelect(undefined);
              handleSort("new");
            }}
          />
        </div>
      </Panel>

      <Panel
        title="your tokens"
        action={
          onClaim ? (
            <button
              onClick={() => {
                onClaim();
                onItemSelected?.();
              }}
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-acid transition hover:text-acid-d"
            >
              + claim
            </button>
          ) : null
        }
      >
        {badges.length === 0 ? (
          <div className="px-3 py-4 font-mono text-[11px] leading-relaxed text-muted">
            no badges yet. claim one to start posting.
          </div>
        ) : (
          <div className="flex flex-col">
            {badges.map((b) => {
              const meta = tokenFor(b.kind);
              const isActive = activeBadge?.badgeId === b.badgeId;
              const filterActive = active === b.kind;
              return (
                <button
                  key={b.badgeId}
                  onClick={() => handleSelect(filterActive ? undefined : b.kind)}
                  className={`group flex items-center gap-2.5 px-3 py-2 text-left transition ${
                    filterActive ? "bg-acid-soft" : "hover:bg-bg-3"
                  }`}
                >
                  <HoloSeal hash={b.anonId ?? b.kind} size={22} animate={isActive} />
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="font-mono text-[12px] text-text">${meta?.symbol ?? b.kind}</span>
                    <span className="truncate font-mono text-[9px] text-muted-2">
                      {b.anonId ?? b.kind}
                    </span>
                  </div>
                  {isActive && (
                    <span className="rounded-sm border border-acid-line bg-acid-soft px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-acid">
                      active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="all tokens">
        <div className="flex flex-col">
          {TOKEN_KINDS.map((kind) => (
            <TokenRow
              key={kind}
              kind={kind}
              meta={TOKENS[kind]!}
              active={active === kind}
              onClick={() => handleSelect(active === kind ? undefined : kind)}
            />
          ))}
        </div>
      </Panel>

      <div className="mt-2 px-3 py-3 font-mono text-[10px] leading-relaxed text-muted">
        wallet ↔ identity stays sealed in magicblock&apos;s tee. you only see badges of tokens people <span className="text-text-2">actually</span> hold.
      </div>
    </Wrapper>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 overflow-hidden rounded-md border border-line bg-bg-2">
      <header className="flex items-center justify-between border-b border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        <span>{title}</span>
        {action}
      </header>
      {children}
    </section>
  );
}

function RailRow({
  label,
  icon,
  active,
  onClick,
  count,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 text-left transition ${
        active ? "bg-acid-soft text-acid" : "text-text-2 hover:bg-bg-3 hover:text-text"
      }`}
    >
      <span className={active ? "text-acid" : "text-muted"}>{icon}</span>
      <span className="flex-1 font-mono text-[12px] leading-none">{label}</span>
      {typeof count === "number" && (
        <span className="font-mono text-[10px] tabular-nums text-muted-2">{count}</span>
      )}
    </button>
  );
}

/**
 * Single all-tokens row. Shows ticker + a deterministic placeholder price
 * and 24h change derived from the symbol so the feed feels alive without
 * a real price feed wired up.
 */
function TokenRow({
  kind,
  meta,
  active,
  onClick,
}: {
  kind: string;
  meta: TokenMeta;
  active: boolean;
  onClick: () => void;
}) {
  const placeholder = useMemo(() => placeholderQuote(meta.symbol), [meta.symbol]);

  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2.5 px-3 py-1.5 text-left transition ${
        active ? "bg-acid-soft" : "hover:bg-bg-3"
      }`}
    >
      <TokenIcon kind={kind} size={18} />
      <span
        className={`flex-1 font-mono text-[11px] leading-none ${
          active ? "text-acid" : "text-text-2"
        }`}
      >
        ${meta.symbol}
      </span>
      <span
        className={`font-mono text-[10px] tabular-nums ${
          placeholder.change >= 0 ? "text-acid" : "text-danger"
        }`}
      >
        {placeholder.change >= 0 ? "+" : ""}
        {placeholder.change.toFixed(1)}%
      </span>
    </button>
  );
}

function placeholderQuote(symbol: string) {
  // Stable per-symbol pseudo-random so the rail doesn't reshuffle on render.
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  const change = ((h % 1000) / 100 - 5).toFixed(1); // -5.0 to +4.99
  return { change: parseFloat(change) };
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="3" y1="4" x2="13" y2="4" strokeLinecap="round" />
      <line x1="3" y1="8" x2="13" y2="8" strokeLinecap="round" />
      <line x1="3" y1="12" x2="9" y2="12" strokeLinecap="round" />
    </svg>
  );
}
function FlameIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 14 Q3 11 5 7 Q5 9 7 9 Q5 5 8 2 Q9 6 11 7 Q12 11 8 14 Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2 L9 7 L14 8 L9 9 L8 14 L7 9 L2 8 L7 7 Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
