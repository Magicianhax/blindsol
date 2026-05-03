"use client";

import { TokenIcon } from "./token-icon";
import { useBadge } from "./badge-context";
import { KINDS_BY_CATEGORY, tokenFor, type TokenMeta } from "@/lib/tokens";

export type SortKind = "new" | "top";

interface LeftSidebarProps {
  active: string | undefined;
  onSelect: (kind: string | undefined) => void;
  sort: SortKind;
  onSort: (s: SortKind) => void;
  postCount: number;
  /**
   * Optional callback fired after the user clicks any nav item. The home
   * page passes this in when the sidebar is rendered inside the mobile
   * drawer — we use it to auto-close the drawer after a selection.
   */
  onItemSelected?: () => void;
  /** Wrapper variant — `desktop` is the sticky rail, `drawer` is mobile slide-in. */
  variant?: "desktop" | "drawer";
}

const CATEGORIES: Array<{ key: TokenMeta["category"]; label: string; emoji: string }> = [
  { key: "DeFi", label: "DeFi", emoji: "🏦" },
  { key: "Memes", label: "Memes", emoji: "🐸" },
  { key: "Infra", label: "Infra", emoji: "🛠" },
];

export function LeftSidebar({
  active,
  onSelect,
  sort,
  onSort,
  postCount,
  onItemSelected,
  variant = "desktop",
}: LeftSidebarProps) {
  const { badges } = useBadge();
  const ownedKinds = new Set(badges.map((b) => b.kind));

  const handleSelect = (kind: string | undefined) => {
    onSelect(kind);
    onItemSelected?.();
  };
  const handleSort = (s: SortKind) => {
    onSort(s);
    onItemSelected?.();
  };

  // The desktop variant uses the sticky rail (.app-sidebar.app-sidebar--desktop
  // is hidden on mobile via CSS). The drawer variant is rendered inside a
  // mobile drawer, so we drop the sticky/scroll wrapping.
  const Wrapper: React.FC<{ children: React.ReactNode }> =
    variant === "desktop"
      ? ({ children }) => <aside className="app-sidebar app-sidebar--desktop">{children}</aside>
      : ({ children }) => <div>{children}</div>;

  return (
    <Wrapper>
      <Section title="Sort">
        <div className="flex flex-col gap-1.5">
          <SortRow active={sort === "new"} onClick={() => handleSort("new")} label="✨ New" />
          <SortRow active={sort === "top"} onClick={() => handleSort("top")} label="🔥 Top" />
        </div>
      </Section>

      <Section title="All threads">
        <button
          onClick={() => handleSelect(undefined)}
          className={`flex w-full items-center justify-between rounded-lg border-2 px-3 py-1.5 text-left font-display text-xl transition ${
            active === undefined
              ? "border-ink bg-crayon-yellow shadow-pen-sm"
              : "border-dashed border-border-soft hover:border-ink hover:bg-surface-2"
          }`}
        >
          <span>everything</span>
          <span className="font-mono text-xs text-muted">{postCount}</span>
        </button>
      </Section>

      {CATEGORIES.map((cat) => (
        <Section key={cat.key} title={`${cat.emoji} ${cat.label}`}>
          <ul className="flex flex-col gap-1">
            {KINDS_BY_CATEGORY[cat.key].map((k) => {
              const meta = tokenFor(k)!;
              const isActive = active === k;
              const owned = ownedKinds.has(k);
              return (
                <li key={k}>
                  <button
                    onClick={() => handleSelect(isActive ? undefined : k)}
                    className={`group flex w-full items-center gap-2.5 rounded-lg border-2 px-2 py-1.5 text-left transition ${
                      isActive
                        ? "border-ink bg-crayon-yellow shadow-pen-sm"
                        : "border-dashed border-transparent hover:border-ink hover:bg-surface-2"
                    }`}
                    title={owned ? `you hold a $${meta.symbol} badge` : undefined}
                  >
                    <TokenIcon kind={k} size={26} />
                    <span className="flex-1 font-display text-lg leading-none">${meta.symbol}</span>
                    {owned && (
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-crayon-green text-paper"
                        aria-label="badge owned"
                      >
                        <CheckTick />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>
      ))}

      <div className="mt-8 border-t-2 border-dashed border-border-soft pt-4 text-[13px] text-muted">
        <p className="font-display text-base text-ink">— a tiny note —</p>
        <p className="mt-1 leading-snug">
          you only see badges of bags people <em>actually</em> hold. wallet ↔ identity stays sealed in MagicBlock&apos;s rollup.
        </p>
      </div>
    </Wrapper>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 font-display text-base text-muted">{title}</h3>
      {children}
    </section>
  );
}

function CheckTick() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SortRow({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border-2 px-3 py-1 text-left font-display text-lg leading-tight transition ${
        active
          ? "border-ink bg-paper shadow-pen-sm"
          : "border-dashed border-transparent hover:border-ink hover:bg-surface-2"
      }`}
    >
      {label}
    </button>
  );
}
