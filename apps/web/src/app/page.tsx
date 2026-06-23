"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { PostComposer } from "@/components/post-composer";
import { ThreadRow } from "@/components/thread-row";
import { ClaimDialog } from "@/components/claim-dialog";
import { useBadge } from "@/components/badge-context";
import { api, type Post } from "@/lib/api";
import { TOKEN_KINDS, tokenFor } from "@/lib/tokens";

type SortKind = "new" | "top";

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortKind>("new");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
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

  return (
    <>
      <TopNav active={sort === "top" ? "trending" : "home"} />

      <div className="mx-auto w-full max-w-[748px] px-3 pb-24 sm:px-4">
        <FeedNav sort={sort} onSort={setSort} filter={filter} onFilter={setFilter} />

        <div className="py-3">
          <PostComposer requiredKind={filter} onPosted={refresh} />
        </div>

        {err && (
          <div className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13px] text-danger">
            Error: {err}
          </div>
        )}

        {loading ? (
          <ListSkeleton />
        ) : visiblePosts.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <ol className="-mx-2">
            {visiblePosts.map((p, i) => (
              <ThreadRow key={p.id} post={p} rank={i + 1} />
            ))}
          </ol>
        )}

        {!loading && visiblePosts.length > 0 && (
          <div className="px-2 pt-4 text-[13px] text-muted">
            <button className="hover:text-text hover:underline">More</button>
          </div>
        )}

        <FooterNote />
      </div>

      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}
    </>
  );
}

/** HN-style sub-nav: sort tabs on the left, a scrollable token strip after. */
function FeedNav({
  sort,
  onSort,
  filter,
  onFilter,
}: {
  sort: SortKind;
  onSort: (s: SortKind) => void;
  filter: string | undefined;
  onFilter: (k: string | undefined) => void;
}) {
  return (
    <nav className="sticky top-[56px] z-20 -mx-3 flex items-center gap-2 border-b border-line bg-bg/90 px-3 py-2 backdrop-blur sm:top-[60px] sm:-mx-4 sm:px-4">
      <div className="flex shrink-0 items-center gap-1">
        <Tab active={sort === "top"} onClick={() => onSort("top")}>
          top
        </Tab>
        <Tab active={sort === "new"} onClick={() => onSort("new")}>
          new
        </Tab>
      </div>
      <span className="h-4 w-px shrink-0 bg-line" />
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar">
        <Tab active={!filter} onClick={() => onFilter(undefined)}>
          all
        </Tab>
        {TOKEN_KINDS.map((kind) => {
          const meta = tokenFor(kind);
          return (
            <Tab key={kind} active={filter === kind} onClick={() => onFilter(kind)}>
              ${meta?.symbol ?? kind}
            </Tab>
          );
        })}
      </div>
    </nav>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[13px] transition ${
        active ? "font-semibold text-acid" : "text-muted hover:bg-bg-2 hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="px-2">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-baseline gap-2 py-1.5">
          <div className="h-3 w-3 shrink-0 animate-pulse rounded bg-bg-3" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-bg-3" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-bg-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filter }: { filter: string | undefined }) {
  return (
    <div className="px-2 py-16 text-center">
      <h3 className="text-[15px] font-medium text-text">No threads yet</h3>
      <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-muted">
        {filter
          ? "Be the first holder to post in this token's forum."
          : "Claim a badge and start the conversation."}
      </p>
    </div>
  );
}

function FooterNote() {
  return (
    <footer className="mt-8 flex flex-wrap items-center gap-3 border-t border-line px-2 pt-4 text-[13px] text-muted">
      <a href="/about" className="transition hover:text-text">
        How it works
      </a>
      <span className="text-muted-2">·</span>
      <a
        href="https://docs.magicblock.gg"
        target="_blank"
        rel="noreferrer"
        className="transition hover:text-text"
      >
        MagicBlock docs ↗
      </a>
      <span className="ml-auto text-muted-2">v0.1 · mainnet beta</span>
    </footer>
  );
}
