"use client";

import Link from "next/link";
import { useState } from "react";
import { api, BADGE_LABELS, type Post } from "@/lib/api";
import { useBadge } from "./badge-context";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function PostCard({ post, upCount = 0, downCount = 0 }: { post: Post; upCount?: number; downCount?: number }) {
  const { badge } = useBadge();
  const [up, setUp] = useState(upCount);
  const [down, setDown] = useState(downCount);
  const [busy, setBusy] = useState<"up" | "down" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function react(kind: "up" | "down") {
    if (!badge) {
      setErr("claim a badge to react");
      return;
    }
    setBusy(kind);
    setErr(null);
    try {
      const result = await api.react(badge.badgeToken, post.id, kind);
      if (result.created) {
        if (kind === "up") setUp((n) => n + 1);
        else setDown((n) => n + 1);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const label = BADGE_LABELS[post.badgeKind] ?? post.badgeKind;

  return (
    <article className="rounded-md border border-border bg-panel p-4">
      <header className="mb-2 flex items-baseline justify-between text-xs text-muted">
        <div>
          <span className="font-mono text-accent">{label}</span>
          <span className="mx-2">·</span>
          <span className="font-mono">{post.authorAnonId}</span>
        </div>
        <span>{timeAgo(post.createdAt)}</span>
      </header>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.content}</p>
      <footer className="mt-3 flex items-center gap-3 text-sm">
        <button
          onClick={() => react("up")}
          disabled={busy !== null}
          className="rounded-md border border-border px-2 py-0.5 text-xs hover:border-accent"
        >
          ▲ {up}
        </button>
        <button
          onClick={() => react("down")}
          disabled={busy !== null}
          className="rounded-md border border-border px-2 py-0.5 text-xs hover:border-red-500"
        >
          ▼ {down}
        </button>
        <Link href={`/post/${post.id}`} className="ml-auto text-xs text-muted hover:text-accent">
          Open thread →
        </Link>
      </footer>
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
    </article>
  );
}
