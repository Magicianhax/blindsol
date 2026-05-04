"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Post } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";

/**
 * Right rail for the desktop layout. Two panels:
 *   - "What's Public · What's Sealed" — privacy contract at a glance
 *   - "Trending now" — top 4 posts from the live feed
 *
 * Hidden on mobile (the design moves these into dedicated screens).
 */
export function RightRail() {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:gap-4">
      <PrivacyPanel />
      <TrendingPanel />
    </aside>
  );
}

function PrivacyPanel() {
  return (
    <Panel title="public · sealed">
      <div className="px-4 py-4">
        <div className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-acid">
          <EyeIcon />
          public
        </div>
        <ul className="mb-4 space-y-1 font-mono text-[11px] leading-relaxed text-text-2">
          <li>· handle (if claimed)</li>
          <li>· badge token</li>
          <li>· posts, comments, votes</li>
        </ul>
        <div className="mb-1.5 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
          <LockIcon />
          sealed
        </div>
        <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-muted">
          <li>· wallet address</li>
          <li>· token balance</li>
          <li>· badge ↔ wallet link</li>
          <li>· your other badges</li>
        </ul>
        <Link
          href="/about"
          className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.06em] text-acid transition hover:text-acid-d"
        >
          read the proof
          <ArrowRightIcon />
        </Link>
      </div>
    </Panel>
  );
}

function TrendingPanel() {
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .listPosts(undefined)
      .then((r) => {
        if (cancelled) return;
        const sorted = [...r.posts].sort((a, b) => {
          const aScore = (a.upCount ?? 0) - (a.downCount ?? 0);
          const bScore = (b.upCount ?? 0) - (b.downCount ?? 0);
          return bScore - aScore;
        });
        setPosts(sorted.slice(0, 4));
      })
      .catch(() => {
        // silent — trending is optional decoration
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel title="trending now">
      <div className="flex flex-col gap-3 px-4 py-4">
        {posts.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2 w-20 animate-pulse rounded bg-bg-3" />
                <div className="h-3 w-full animate-pulse rounded bg-bg-3" />
              </div>
            ))
          : posts.map((p, i) => {
              const meta = tokenFor(p.badgeKind);
              const sym = meta?.symbol ?? p.badgeKind;
              const score = (p.upCount ?? 0) - (p.downCount ?? 0);
              const title = p.title || p.content.split("\n")[0]?.trim() || "(empty)";
              return (
                <Link key={p.id} href={`/post/${p.id}`} className="block">
                  <div className="mb-1 font-mono text-[9px] tabular-nums text-muted-2">
                    {String(i + 1).padStart(2, "0")} · ${sym} ·{" "}
                    <span className="text-acid">{score > 0 ? `+${score}` : score} ↑</span>
                  </div>
                  <div className="line-clamp-2 font-mono text-[11px] leading-snug text-text transition hover:text-acid">
                    {title}
                  </div>
                </Link>
              );
            })}
      </div>
    </Panel>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-line bg-bg-2">
      <header className="border-b border-line px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        {title}
      </header>
      {children}
    </section>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1.5 8 Q4 3.5 8 3.5 Q12 3.5 14.5 8 Q12 12.5 8 12.5 Q4 12.5 1.5 8 Z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3.5" y="7.5" width="9" height="6" rx="1" />
      <path d="M5.5 7.5 V5 Q5.5 2.5 8 2.5 Q10.5 2.5 10.5 5 V7.5" strokeLinecap="round" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 8 L13 8 M9 4 L13 8 L9 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
