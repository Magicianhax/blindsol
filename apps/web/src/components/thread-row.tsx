"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type Post } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";
import { useBadge } from "./badge-context";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

/** Legacy fallback for rows posted before the dedicated `title` column. */
function deriveTitle(content: string): string {
  const trimmed = content.trim();
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline > 0 && firstNewline < 120) return trimmed.slice(0, firstNewline).trim();
  if (trimmed.length <= 110) return trimmed;
  const cut = trimmed.slice(0, 110);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

/**
 * A single Hacker-News-style feed row: rank, a small upvote triangle, the
 * title link, and a one-line gray subtext (points · author · token · age ·
 * replies). No card, no avatar — dense and text-first.
 */
export function ThreadRow({ post, rank }: { post: Post; rank: number }) {
  const meta = tokenFor(post.badgeKind);
  const symbol = meta ? meta.symbol : post.badgeKind;
  const title = post.title || deriveTitle(post.content);

  const { badge } = useBadge();
  const [up, setUp] = useState(post.upCount ?? 0);
  const down = post.downCount ?? 0;
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const score = up - down;

  async function upvote() {
    if (!badge || busy || voted) return;
    setBusy(true);
    try {
      const r = await api.react(badge.badgeToken, post.id, "up");
      if (r.created) {
        setUp((n) => n + 1);
        setVoted(true);
      }
    } catch {
      // surface on the post page
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-baseline gap-2 px-2 py-1.5">
      <span className="w-6 shrink-0 text-right font-numeric text-[13px] tabular-nums text-muted-2">
        {rank}.
      </span>
      <button
        onClick={upvote}
        disabled={busy || !badge || voted}
        title={badge ? "Upvote" : "Claim a badge to vote"}
        aria-label="Upvote"
        className={`relative top-[2px] shrink-0 transition disabled:cursor-default disabled:opacity-40 ${
          voted ? "text-acid" : "text-muted-2 hover:text-acid"
        }`}
      >
        <svg viewBox="0 0 10 10" width="11" height="11" fill="currentColor" aria-hidden>
          <path d="M5 0.5 L9.5 9 L0.5 9 Z" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <Link
          href={`/post/${post.id}`}
          className="text-[15px] leading-snug text-text visited:text-muted hover:underline"
        >
          {title || "(empty post)"}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
          <span>
            <span className="font-numeric tabular-nums">{score}</span>{" "}
            {Math.abs(score) === 1 ? "point" : "points"}
          </span>
          <Sep />
          <Link
            href={`/u/${post.authorAnonId}`}
            className="font-numeric hover:text-text hover:underline"
          >
            {post.displayName ? `@${post.displayName}` : post.authorAnonId}
          </Link>
          <span className="inline-flex items-center gap-0.5 text-acid" title="Verified holder">
            <CheckGlyph />${symbol}
          </span>
          <Sep />
          <span>{timeAgo(post.createdAt)}</span>
          <Sep />
          <Link href={`/post/${post.id}`} className="hover:text-text hover:underline">
            {post.commentCount ?? 0} {(post.commentCount ?? 0) === 1 ? "reply" : "replies"}
          </Link>
        </div>
      </div>
    </li>
  );
}

function Sep() {
  return <span className="text-muted-2">·</span>;
}

function CheckGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 8.5 L6.5 12 L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
