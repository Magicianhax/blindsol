"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { RoomNav, type SortKind } from "@/components/room-nav";
import { PostComposer } from "@/components/post-composer";
import { ThreadRow } from "@/components/thread-row";
import { TokenChip } from "@/components/token-chip";
import { Seal } from "@/components/seal";
import { useBadge } from "@/components/badge-context";
import { SiteFooter } from "@/components/site-footer";
import { api, type Post } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";
import { netScore, hotScore } from "@/lib/scoring";

export default function ForumPage() {
  return (
    <Suspense fallback={<TopNav />}>
      <ForumInner />
    </Suspense>
  );
}

function ForumInner() {
  const params = useSearchParams();
  const room = params.get("room") || undefined;
  const composeFlag = params.get("compose") === "1";

  const [posts, setPosts] = useState<Post[]>([]);
  const [sort, setSort] = useState<SortKind>("hot");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Sync the active badge with the room — if you open $BONK and hold it,
  // switch onto that badge so your next post lands in the right place.
  const { badges, active, setActive } = useBadge();
  useEffect(() => {
    if (!room) return;
    const match = badges.find((b) => b.kind === room);
    if (match && match.badgeId !== active?.badgeId) setActive(match.badgeId);
  }, [room, badges, active?.badgeId, setActive]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.listPosts(room);
      setPosts(r.posts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [room]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const visible = useMemo(() => {
    const list = [...posts];
    if (sort === "new") {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sort === "top") {
      list.sort(
        (a, b) =>
          netScore(b) - netScore(a) ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else {
      list.sort((a, b) => hotScore(b) - hotScore(a));
    }
    return list;
  }, [posts, sort]);

  const meta = room ? tokenFor(room) : undefined;
  const isHeld = !!room && badges.some((b) => b.kind === room);

  return (
    <>
      <TopNav />
      <RoomNav activeRoom={room} sort={sort} onSort={setSort} />

      <main className="bs-main">
        <div className="roomhead">
          {room ? (
            <>
              <div className="rh-tok">
                <TokenChip kind={room} />
                {isHeld && <span className="held-tag">unsealed</span>}
              </div>
              <h1>${meta?.symbol ?? room} holders</h1>
              <p className="rb">verified holders only · anonymous, sealed on Solana</p>
            </>
          ) : (
            <>
              <h1>All rooms</h1>
              <p className="rb">Every community — anonymous, chronological, vote-sorted.</p>
            </>
          )}
        </div>

        <PostComposer requiredKind={room} defaultOpen={composeFlag} onPosted={refresh} />

        {err && (
          <div className="mb-3 rounded border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13px] text-danger">
            Error: {err}
          </div>
        )}

        {loading ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState room={room} />
        ) : (
          <ol className="feed">
            {visible.map((p) => (
              <ThreadRow key={p.id} post={p} />
            ))}
          </ol>
        )}

        <SiteFooter />
      </main>
    </>
  );
}

function ListSkeleton() {
  return (
    <ol className="feed">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <li key={i} className="row">
          <div className="vote">
            <span className="tri opacity-30">▲</span>
          </div>
          <div className="rmain">
            <div className="h-4 w-2/3 animate-pulse rounded bg-bg-3" />
            <div className="mt-2 h-2.5 w-1/3 animate-pulse rounded bg-bg-3" />
          </div>
        </li>
      ))}
    </ol>
  );
}

function EmptyState({ room }: { room: string | undefined }) {
  return (
    <div className="empty">
      <Seal hash={room ? room + "00empty" : "blindsol-empty"} size={48} />
      <p>Nothing sealed here yet.</p>
      <a className="btn solid" href={room ? `/forum?room=${room}&compose=1` : "/forum?compose=1"}>
        Start the first thread
      </a>
    </div>
  );
}

