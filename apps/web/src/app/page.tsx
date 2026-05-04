"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { LeftSidebar, type SortKind } from "@/components/left-sidebar";
import { MobileDrawer } from "@/components/mobile-drawer";
import { RightRail } from "@/components/right-rail";
import { PostComposer } from "@/components/post-composer";
import { ThreadRow } from "@/components/thread-row";
import { ClaimDialog } from "@/components/claim-dialog";
import { useBadge } from "@/components/badge-context";
import { api, type Post } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortKind>("new");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // Sync the active badge with the community filter — if the user filters
  // to $BONK and they hold a $BONK badge, switch them onto it so their next
  // post lands in the right place.
  const { badges, active, setActive } = useBadge();
  useEffect(() => {
    if (!filter) return;
    const match = badges.find((b) => b.kind === filter);
    if (match && match.badgeId !== active?.badgeId) setActive(match.badgeId);
  }, [filter, badges, active?.badgeId, setActive]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.listPosts(filter);
      setPosts(r.posts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visiblePosts = useMemo(() => {
    let list = posts;
    if (sort === "top") {
      list = [...list].sort((a, b) => {
        const aScore = (a.upCount ?? 0) - (a.downCount ?? 0);
        const bScore = (b.upCount ?? 0) - (b.downCount ?? 0);
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return list;
  }, [posts, sort]);

  const filterMeta = filter ? tokenFor(filter) : undefined;

  return (
    <>
      <TopNav
        active={sort === "top" ? "trending" : "home"}
        onOpenMenu={() => setMenuOpen(true)}
      />

      <MobileDrawer open={menuOpen} onClose={() => setMenuOpen(false)}>
        <LeftSidebar
          variant="drawer"
          active={filter}
          onSelect={setFilter}
          sort={sort}
          onSort={setSort}
          postCount={posts.length}
          onItemSelected={() => setMenuOpen(false)}
          onClaim={() => {
            setMenuOpen(false);
            setClaiming(true);
          }}
        />
      </MobileDrawer>

      <div className="app-layout">
        <LeftSidebar
          active={filter}
          onSelect={setFilter}
          sort={sort}
          onSort={setSort}
          postCount={posts.length}
          onClaim={() => setClaiming(true)}
        />

        <main className="app-main">
          <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-mono text-[20px] font-medium leading-tight tracking-tight text-text">
              <span className="text-muted-2">~/</span>
              {filter ? `t/${filterMeta?.symbol.toLowerCase()}` : sort === "top" ? "trending" : "feed"}
            </h1>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              {filter
                ? `posts from $${filterMeta?.symbol} holders`
                : sort === "top"
                ? "ranked by ▲ minus ▼"
                : "posts from holders of every verified token"}
            </span>
          </div>

          <div className="mb-4">
            <PostComposer requiredKind={filter} onPosted={refresh} />
          </div>

          {err && (
            <div className="mb-4 rounded border border-danger/40 bg-danger/10 p-3 font-mono text-[12px] text-danger">
              oops — {err}
            </div>
          )}

          <div className="overflow-hidden rounded-md border border-line bg-bg-2">
            <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                {visiblePosts.length} {visiblePosts.length === 1 ? "thread" : "threads"}
              </span>
              <SortPills sort={sort} onSort={setSort} />
            </header>
            {loading ? (
              <ListSkeleton />
            ) : visiblePosts.length === 0 ? (
              <EmptyState filter={filter} />
            ) : (
              <ul>
                {visiblePosts.map((p) => (
                  <li key={p.id}>
                    <ThreadRow post={p} />
                  </li>
                ))}
              </ul>
            )}
            <footer className="border-t border-line px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              end of feed · <span className="text-acid">load older</span>
            </footer>
          </div>

          <FooterNote />
        </main>

        <RightRail />
      </div>

      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </>
  );
}

function SortPills({ sort, onSort }: { sort: SortKind; onSort: (s: SortKind) => void }) {
  const pills: Array<{ id: SortKind; label: string }> = [
    { id: "top", label: "trending" },
    { id: "new", label: "new" },
  ];
  return (
    <div className="flex gap-0.5 rounded border border-line bg-bg-3 p-0.5">
      {pills.map((p) => {
        const active = sort === p.id;
        return (
          <button
            key={p.id}
            onClick={() => onSort(p.id)}
            className={`rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition ${
              active ? "bg-bg-4 text-acid" : "text-text-2 hover:text-text"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="thread-row">
          <div className="flex flex-col items-center gap-1 pt-0.5">
            <div className="h-3 w-3 animate-pulse rounded bg-bg-3" />
            <div className="h-3 w-6 animate-pulse rounded bg-bg-3" />
            <div className="h-3 w-3 animate-pulse rounded bg-bg-3" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-bg-3" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-bg-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filter }: { filter: string | undefined }) {
  return (
    <div className="px-6 py-16 text-center">
      <h3 className="font-mono text-[14px] text-text">empty.</h3>
      <p className="mt-2 font-mono text-[12px] text-text-2">
        {filter
          ? "be the first holder to post in this token's forum."
          : "no threads yet. claim a badge and start the conversation."}
      </p>
    </div>
  );
}

function FooterNote() {
  return (
    <footer className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4 font-mono text-[11px] text-muted">
      <a href="/about" className="text-text-2 transition hover:text-acid">
        how it works →
      </a>
      <span className="text-muted-2">·</span>
      <a
        href="https://docs.magicblock.gg"
        target="_blank"
        rel="noreferrer"
        className="text-text-2 transition hover:text-acid"
      >
        magicblock docs ↗
      </a>
      <span className="ml-auto uppercase tracking-[0.1em] text-muted-2">v0.1 · mainnet beta</span>
    </footer>
  );
}
