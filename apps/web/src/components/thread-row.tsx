"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type Post } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";
import { HoloSeal, VerifiedDot } from "./holo-seal";
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
  const symbol = meta ? meta.symbol : post.badgeKind;
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
      // surface on detail page
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="thread-row">
      <div className="flex flex-col items-center gap-0.5 pt-0.5 text-muted">
        <button
          onClick={() => vote("up")}
          disabled={busy || !badge}
          className="rounded p-1 transition hover:bg-bg-3 hover:text-acid disabled:opacity-30"
          title={badge ? "Upvote" : "Claim a badge to vote"}
          aria-label="Upvote"
        >
          <ArrowUpIcon />
        </button>
        <span
          className={`font-mono text-[12px] font-semibold tabular-nums ${
            liveScore > 0 ? "text-acid" : liveScore < 0 ? "text-danger" : "text-text-2"
          }`}
        >
          {liveScore > 0 ? `+${liveScore}` : liveScore}
        </span>
        <button
          onClick={() => vote("down")}
          disabled={busy || !badge}
          className="rounded p-1 transition hover:bg-bg-3 hover:text-danger disabled:opacity-30"
          title={badge ? "Downvote" : "Claim a badge to vote"}
          aria-label="Downvote"
        >
          <ArrowDownIcon />
        </button>
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span className="scribble-chip" style={{ padding: "3px 8px 3px 5px" }}>
            <TokenIcon kind={post.badgeKind} size={14} />
            <span>${symbol}</span>
          </span>
          <span className="text-muted-2">·</span>
          <span className="inline-flex items-center gap-1.5">
            <HoloSeal hash={post.authorAnonId} size={16} />
            <Link
              href={`/u/${post.authorAnonId}`}
              className="rounded px-0.5 transition hover:text-acid"
            >
              {post.displayName ? (
                <span className="font-mono text-[12px] text-text">@{post.displayName}</span>
              ) : (
                <span className="font-mono text-[11px] text-text-2">{post.authorAnonId}</span>
              )}
            </Link>
          </span>
          <VerifiedDot />
          <span className="text-muted-2">·</span>
          <span>{timeAgo(post.createdAt)}</span>
        </div>

        <Link href={`/post/${post.id}`} className="block">
          <h3 className="break-words font-mono text-[15px] font-medium leading-snug text-text transition hover:text-acid">
            {title || "(empty post)"}
          </h3>
          {excerpt && (
            <p className="mt-1.5 line-clamp-2 break-words font-mono text-[12px] leading-relaxed text-text-2">
              {excerpt}
            </p>
          )}
        </Link>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
          <Link
            href={`/post/${post.id}`}
            className="inline-flex items-center gap-1.5 transition hover:text-acid"
          >
            <ChatIcon />
            {post.commentCount ?? 0} {(post.commentCount ?? 0) === 1 ? "reply" : "replies"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 9 L8 4 L13 9 M8 4 L8 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 7 L8 12 L13 7 M8 12 L8 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 4 L3 9 Q3 11 5 11 L13 11 M10 8 L13 11 L10 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
