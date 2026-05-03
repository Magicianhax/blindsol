"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { LeftSidebar, type SortKind } from "@/components/left-sidebar";
import { MobileDrawer } from "@/components/mobile-drawer";
import { PostComposer } from "@/components/post-composer";
import { ThreadRow } from "@/components/thread-row";
import { useBadge } from "@/components/badge-context";
import { api, type Post } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortKind>("new");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Sync the active badge with the community filter — if the user filters
  // to $BONK and they hold a $BONK badge, switch them onto it so their next
  // post lands in the right place. We DO NOT switch off if they don't hold
  // a matching badge; the composer renders a "claim $BONK" prompt instead.
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
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => {
        const meta = tokenFor(p.badgeKind);
        const sym = meta ? `$${meta.symbol}`.toLowerCase() : "";
        return (
          p.content.toLowerCase().includes(q) ||
          p.authorAnonId.toLowerCase().includes(q) ||
          sym.includes(q)
        );
      });
    }
    if (sort === "top") {
      list = [...list].sort((a, b) => {
        const aScore = (a.upCount ?? 0) - (a.downCount ?? 0);
        const bScore = (b.upCount ?? 0) - (b.downCount ?? 0);
        if (bScore !== aScore) return bScore - aScore;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return list;
  }, [posts, sort, search]);

  const filterMeta = filter ? tokenFor(filter) : undefined;

  return (
    <>
      <TopNav
        search={search}
        onSearch={setSearch}
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
        />
      </MobileDrawer>

      <div className="app-layout">
        <LeftSidebar
          active={filter}
          onSelect={setFilter}
          sort={sort}
          onSort={setSort}
          postCount={posts.length}
        />

        <main className="app-main">
          <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-1 sm:mb-5">
            <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl md:text-5xl">
              <span className="scribble-underline">
                {filter ? `$${filterMeta?.symbol}` : sort === "top" ? "trending" : "the feed"}
              </span>
            </h1>
            <span className="font-display text-base text-muted sm:text-lg">
              {filter
                ? `threads from $${filterMeta?.symbol} holders`
                : sort === "top"
                ? "ranked by ▲ minus ▼"
                : "freshest first, like bread"}
            </span>
          </div>

          <div className="mb-5">
            <PostComposer requiredKind={filter} onPosted={refresh} />
          </div>

          {err && (
            <div className="mb-4 rounded-lg border-2 border-crayon-red bg-crayon-red/10 p-3 text-sm text-crayon-red">
              oops — {err}
            </div>
          )}

          <div className="scribble-card overflow-hidden">
            {loading ? (
              <ListSkeleton />
            ) : visiblePosts.length === 0 ? (
              <EmptyState filter={filter} hasSearch={!!search.trim()} />
            ) : (
              <ul className="wobble-in">
                {visiblePosts.map((p) => (
                  <li key={p.id}>
                    <ThreadRow post={p} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <FooterNote />
        </main>
      </div>
    </>
  );
}

function ListSkeleton() {
  return (
    <div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="thread-row">
          <div className="flex flex-col items-center gap-1 pt-0.5">
            <div className="h-3 w-3 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-6 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-3 animate-pulse rounded bg-surface-3" />
          </div>
          <div className="space-y-2">
            <div className="h-5 w-3/4 animate-pulse rounded bg-surface-3" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filter, hasSearch }: { filter: string | undefined; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="px-6 py-16 text-center">
        <h3 className="font-display text-3xl text-ink">no luck</h3>
        <p className="mt-2 text-base text-text-2">nothing matched. try fewer words?</p>
      </div>
    );
  }
  return (
    <div className="px-6 py-16 text-center">
      <h3 className="font-display text-3xl text-ink">empty.</h3>
      <p className="mt-2 text-base text-text-2">
        {filter
          ? "be the first to post in this little corner."
          : "no threads yet. claim a badge and start saying things."}
      </p>
    </div>
  );
}

function FooterNote() {
  return (
    <footer className="mt-8 flex flex-wrap items-center gap-3 border-t-2 border-dashed border-border-soft pt-4 text-[13px] text-muted">
      <a href="/about" className="font-display text-base text-ink hover:text-crayon-blue">
        what is this? →
      </a>
      <span className="text-muted-2">·</span>
      <a href="https://docs.magicblock.gg" target="_blank" rel="noreferrer" className="hover:text-ink">
        MagicBlock docs ↗
      </a>
      <span className="ml-auto">v0.1 · mainnet beta</span>
    </footer>
  );
}
