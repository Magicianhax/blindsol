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
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-text"
        >
          <BackIcon />
          Back to feed
        </Link>

        {err && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2.5 text-[13px] text-danger">
            Error: {err}
          </div>
        )}

        {loading && !post && (
          <div className="scribble-card p-10 text-center text-[13px] text-muted">
            Loading…
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
      setVoteErr("Claim a badge to vote");
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
      <header className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <Link
          href={`/?filter=${post.badgeKind}`}
          className="text-text-2 transition hover:text-acid"
        >
          ← Back to ${symbol}
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
            <span className="font-medium text-text">@{post.displayName}</span>
          ) : (
            <span className="font-numeric text-[12px] text-text-2">{post.authorAnonId}</span>
          )}
        </Link>
        <VerifiedDot />
        <span className="text-muted-2">·</span>
        <span>{timeAgo(post.createdAt)}</span>
      </header>

      {title && (
        <h1 className="mb-3 break-words text-[22px] font-semibold leading-snug tracking-tight text-text sm:text-[26px]">
          {title}
        </h1>
      )}
      {body && (
        <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-text-2">
          {body}
        </p>
      )}
      {!title && !body && (
        <p className="text-[13px] text-muted">(empty post)</p>
      )}

      <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button
          onClick={() => vote("up")}
          disabled={busy || !badge}
          className={`scribble-chip ${score > 0 ? "scribble-chip--active" : ""} hover:text-acid disabled:opacity-40`}
          title={badge ? "Upvote" : "Claim a badge to vote"}
        >
          <ArrowUpIcon /> <span className="font-numeric">{upCount}</span>
        </button>
        <button
          onClick={() => vote("down")}
          disabled={busy || !badge}
          className={`scribble-chip ${score < 0 ? "scribble-chip--active" : ""} hover:text-text disabled:opacity-40`}
          title={badge ? "Downvote" : "Claim a badge to vote"}
        >
          <ArrowDownIcon /> <span className="font-numeric">{downCount}</span>
        </button>
        <span className="ml-2 text-[13px] text-muted">
          Score{" "}
          <span
            className={`font-numeric ${
              score > 0 ? "text-acid" : score < 0 ? "text-text-2" : "text-muted"
            }`}
          >
            {score > 0 ? `+${score}` : score}
          </span>
        </span>
        {voteErr && (
          <span className="ml-auto text-[13px] text-danger">{voteErr}</span>
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
