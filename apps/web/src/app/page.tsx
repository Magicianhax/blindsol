"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/header";
import { PostComposer } from "@/components/post-composer";
import { PostCard } from "@/components/post-card";
import { api, BADGE_LABELS, type Post } from "@/lib/api";

const FILTERS: Array<{ value: string | undefined; label: string }> = [
  { value: undefined, label: "All" },
  ...Object.entries(BADGE_LABELS).map(([value, label]) => ({ value, label })),
];

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <PostComposer onPosted={refresh} />

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-mono transition ${
                filter === f.value ? "border-accent text-accent" : "border-border text-muted hover:border-muted hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {err && <div className="rounded-md border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{err}</div>}

        <div className="space-y-3">
          {loading && <div className="text-sm text-muted">Loading…</div>}
          {!loading && posts.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted">
              No posts in this feed yet. Be the first to spill.
            </div>
          )}
          {posts.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </main>
    </div>
  );
}
