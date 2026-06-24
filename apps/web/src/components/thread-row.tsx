"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type Post } from "@/lib/api";
import { timeAgo, deriveTitle } from "@/lib/format";
import { netScore } from "@/lib/scoring";
import { TokenChip } from "./token-chip";
import { useBadge } from "./badge-context";

/**
 * One feed row — vote column + serif title + monospace meta line, matching the
 * prototype's `.row`. Upvoting goes through the real reactions API; it stays
 * one-way (an upvote can't be taken back) to match the existing app behavior.
 */
export function ThreadRow({ post }: { post: Post }) {
  const title = post.title || deriveTitle(post.content);
  const { badge, active } = useBadge();
  const [up, setUp] = useState(post.upCount ?? 0);
  const down = post.downCount ?? 0;
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const score = netScore({ upCount: up, downCount: down });
  const isMe = !!active?.anonId && active.anonId === post.authorAnonId;

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
      // swallow — a failed vote just leaves the count unchanged
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="row">
      <button
        className={`vote${voted ? " on" : ""}`}
        onClick={upvote}
        disabled={busy || !badge || voted}
        title={badge ? "upvote" : "claim a badge to vote"}
        aria-label="upvote"
      >
        <span className="tri">▲</span>
        <span className="vn">{score}</span>
      </button>

      <div className="rmain">
        <Link className="title" href={`/post/${post.id}`}>
          {title || "(empty post)"}
        </Link>
        <div className="meta">
          <span className="pts">
            {score} {Math.abs(score) === 1 ? "point" : "points"}
          </span>{" "}
          ·{" "}
          <Link className="by" href={`/u/${post.authorAnonId}`}>
            {post.displayName ? `@${post.displayName}` : post.authorAnonId}
            {isMe && <span className="tagyou"> you</span>}
          </Link>{" "}
          ·{" "}
          <Link className="room" href={`/forum?room=${post.badgeKind}`}>
            <TokenChip kind={post.badgeKind} />
          </Link>{" "}
          · <span>{timeAgo(post.createdAt)}</span> ·{" "}
          <Link className="cmts" href={`/post/${post.id}`}>
            {post.commentCount ?? 0} {(post.commentCount ?? 0) === 1 ? "comment" : "comments"}
          </Link>
        </div>
      </div>
    </li>
  );
}
