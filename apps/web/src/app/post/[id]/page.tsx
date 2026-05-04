"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { CommentThread } from "@/components/comment-thread";
import { TokenIcon } from "@/components/token-icon";
import { HoloSeal, VerifiedDot } from "@/components/holo-seal";
import { useBadge } from "@/components/badge-context";
import { tokenFor } from "@/lib/tokens";
import { api, type Comment, type Post, type Reaction } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Legacy fallback for rows posted before the dedicated `title` column. */
function deriveTitleAndBody(content: string): { title: string; body: string } {
  const trimmed = content.trim();
  const firstNewline = trimmed.indexOf("\n");
  if (firstNewline > 0 && firstNewline < 200) {
    return { title: trimmed.slice(0, firstNewline).trim(), body: trimmed.slice(firstNewline + 1).trim() };
  }
  if (trimmed.length <= 160) return { title: trimmed, body: "" };
  return { title: "", body: trimmed };
}

function titleAndBody(post: Post): { title: string; body: string } {
  if (post.title) return { title: post.title, body: post.content };
  return deriveTitleAndBody(post.content);
}

export default function PostPage({ params }: PageProps) {
  const { id } = use(params);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api.getPost(id);
      setPost(r.post);
      setComments(r.comments);
      setReactions(r.reactions);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upCount = reactions.filter((r) => r.kind === "up").length;
  const downCount = reactions.filter((r) => r.kind === "down").length;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link
          href="/"
          className="scribble-btn scribble-btn--ghost mb-5 inline-flex"
        >
          <BackIcon />
          back to feed
        </Link>

        {err && (
          <div className="mb-4 rounded border border-danger/40 bg-danger/10 p-3 font-mono text-[12px] text-danger">
            oops — {err}
          </div>
        )}

        {loading && !post && (
          <div className="scribble-card p-10 text-center font-mono text-[13px] text-muted">
            loading…
          </div>
        )}

        {post && <ThreadDetail post={post} upCount={upCount} downCount={downCount} onVoted={refresh} />}

        {post && (
          <div className="mt-6">
            <CommentThread postId={post.id} comments={comments} onCommentPosted={refresh} />
          </div>
        )}
      </main>
    </>
  );
}

function ThreadDetail({
  post,
  upCount,
  downCount,
  onVoted,
}: {
  post: Post;
  upCount: number;
  downCount: number;
  onVoted: () => void;
}) {
  const { badge } = useBadge();
  const meta = tokenFor(post.badgeKind);
  const symbol = meta ? meta.symbol : post.badgeKind;
  const { title, body } = titleAndBody(post);
  const score = upCount - downCount;
  const [busy, setBusy] = useState(false);
  const [voteErr, setVoteErr] = useState<string | null>(null);

  async function vote(kind: "up" | "down") {
    if (!badge) {
      setVoteErr("claim a badge to vote");
      return;
    }
    setBusy(true);
    setVoteErr(null);
    try {
      await api.react(badge.badgeToken, post.id, kind);
      onVoted();
    } catch (e) {
      setVoteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="scribble-card p-6">
      <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted">
        <Link
          href={`/?filter=${post.badgeKind}`}
          className="font-mono text-[11px] text-text-2 transition hover:text-acid"
        >
          ← /t/{symbol.toLowerCase()}
        </Link>
        <span className="text-muted-2">·</span>
        <span className="scribble-chip" style={{ padding: "3px 8px 3px 5px" }}>
          <TokenIcon kind={post.badgeKind} size={14} />
          <span>${symbol}</span>
        </span>
        <span className="text-muted-2">·</span>
        <HoloSeal hash={post.authorAnonId} size={20} />
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
        <VerifiedDot />
        <span className="text-muted-2">·</span>
        <span>{timeAgo(post.createdAt)}</span>
      </header>

      {title && (
        <h1 className="mb-3 break-words font-mono text-[22px] font-medium leading-snug tracking-tight text-text sm:text-[26px]">
          {title}
        </h1>
      )}
      {body && (
        <p className="whitespace-pre-wrap break-words font-mono text-[14px] leading-relaxed text-text-2">
          {body}
        </p>
      )}
      {!title && !body && (
        <p className="font-mono text-[13px] text-muted">(empty post)</p>
      )}

      <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          onClick={() => vote("up")}
          disabled={busy || !badge}
          className={`scribble-chip ${score > 0 ? "scribble-chip--active" : ""} disabled:opacity-40`}
          title={badge ? "Upvote" : "Claim a badge to vote"}
        >
          ▲ <span className="font-mono">{upCount}</span>
        </button>
        <button
          onClick={() => vote("down")}
          disabled={busy || !badge}
          className={`scribble-chip ${score < 0 ? "scribble-chip--active" : ""} disabled:opacity-40`}
          title={badge ? "Downvote" : "Claim a badge to vote"}
        >
          ▼ <span className="font-mono">{downCount}</span>
        </button>
        <span className="ml-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          score{" "}
          <span
            className={`font-mono ${
              score > 0 ? "text-acid" : score < 0 ? "text-danger" : "text-text-2"
            }`}
          >
            {score > 0 ? `+${score}` : score}
          </span>
        </span>
        {voteErr && (
          <span className="ml-auto font-mono text-[11px] text-danger">{voteErr}</span>
        )}
      </footer>
    </article>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M13 8H3M7 4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
