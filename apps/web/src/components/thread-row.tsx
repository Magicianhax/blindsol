"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type Post } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";
import { useBadge } from "./badge-context";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Legacy fallback for rows posted before the dedicated `title` column. */
function deriveTitle(content: string): { title: string; excerpt: string } {
  const trimmed = content.trim();
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline > 0 && firstNewline < 120) {
    return { title: trimmed.slice(0, firstNewline).trim(), excerpt: trimmed.slice(firstNewline + 1).trim() };
  }
  if (trimmed.length <= 110) return { title: trimmed, excerpt: "" };
  const cut = trimmed.slice(0, 110);
  const lastSpace = cut.lastIndexOf(" ");
  const title = (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim() + "…";
  return { title, excerpt: trimmed };
}

export function ThreadRow({ post }: { post: Post }) {
  const meta = tokenFor(post.badgeKind);
  const symbol = meta ? `$${meta.symbol}` : post.badgeKind;
  // Prefer the real title column; fall back to deriving from content for
  // legacy rows posted before we split the fields.
  const { title, excerpt } = post.title
    ? { title: post.title, excerpt: post.content }
    : deriveTitle(post.content);

  const { badge } = useBadge();
  const [up, setUp] = useState(post.upCount ?? 0);
  const [down, setDown] = useState(post.downCount ?? 0);
  const [busy, setBusy] = useState(false);
  const liveScore = up - down;

  async function vote(kind: "up" | "down") {
    if (!badge || busy) return;
    setBusy(true);
    try {
      const r = await api.react(badge.badgeToken, post.id, kind);
      if (r.created) {
        if (kind === "up") setUp((n) => n + 1);
        else setDown((n) => n + 1);
      }
    } catch {
      // swallow in row, surface on detail page
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="thread-row">
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <button
          onClick={() => vote("up")}
          disabled={busy || !badge}
          className="rounded-full p-1 text-muted transition hover:bg-crayon-green/15 hover:text-crayon-green disabled:opacity-40"
          title={badge ? "Upvote" : "Claim a badge to vote"}
          aria-label="Upvote"
        >
          <ArrowUpIcon />
        </button>
        <span
          className={`font-display text-lg leading-none ${
            liveScore > 0 ? "text-crayon-green" : liveScore < 0 ? "text-crayon-red" : "text-muted"
          }`}
        >
          {liveScore > 0 ? `+${liveScore}` : liveScore}
        </span>
        <button
          onClick={() => vote("down")}
          disabled={busy || !badge}
          className="rounded-full p-1 text-muted transition hover:bg-crayon-red/15 hover:text-crayon-red disabled:opacity-40"
          title={badge ? "Downvote" : "Claim a badge to vote"}
          aria-label="Downvote"
        >
          <ArrowDownIcon />
        </button>
      </div>

      <div className="min-w-0">
        <Link href={`/post/${post.id}`} className="block">
          <h3 className="break-words font-display text-xl leading-tight text-ink hover:text-crayon-blue sm:text-2xl">
            {title || "(empty post)"}
          </h3>
          {excerpt && (
            <p className="mt-1 line-clamp-2 break-words text-[14px] leading-snug text-text-2 sm:text-[15px]">
              {excerpt}
            </p>
          )}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <TokenIcon kind={post.badgeKind} size={18} />
            <span className="font-display text-base text-ink">{symbol}</span>
          </span>
          <Sep />
          <span className="font-mono text-[12px]">{post.authorAnonId}</span>
          <Sep />
          <span>{timeAgo(post.createdAt)}</span>
          <Sep />
          <Link
            href={`/post/${post.id}`}
            className="inline-flex items-center gap-1 rounded px-1 transition hover:bg-surface-2 hover:text-ink"
          >
            <ChatIcon />
            {post.commentCount ?? 0} {(post.commentCount ?? 0) === 1 ? "reply" : "replies"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Sep() {
  return <span className="text-muted-2">·</span>;
}
function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 13V3M3 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3v10M3 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2H7l-3 3v-3H4a2 2 0 01-2-2V4z" strokeLinejoin="round" />
    </svg>
  );
}
