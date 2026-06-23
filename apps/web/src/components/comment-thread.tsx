"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type Comment } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";
import { HoloSeal } from "./holo-seal";
import { useBadge } from "./badge-context";
import { ClaimDialog } from "./claim-dialog";

interface Props {
  postId: string;
  comments: Comment[];
  onCommentPosted?: () => void;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function CommentThread({ postId, comments, onCommentPosted }: Props) {
  const { badge } = useBadge();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  async function submit() {
    if (!badge) {
      setErr("Claim a badge to reply");
      return;
    }
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createComment(badge.badgeToken, postId, text.trim(), replyTo ?? undefined);
      setText("");
      setReplyTo(null);
      onCommentPosted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const top = comments.filter((c) => !c.parentId);
  const childrenOf = (id: string) => comments.filter((c) => c.parentId === id);
  const symbol = badge ? tokenFor(badge.kind)?.symbol ?? badge.kind : null;

  return (
    <section className="space-y-4">
      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}

      {badge ? (
        <div className="scribble-card p-4">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between text-[12px] text-muted">
              <span>
                Replying to <span className="font-numeric text-text-2">{replyTo.slice(0, 8)}</span>
              </span>
              <button
                onClick={() => setReplyTo(null)}
                className="text-[12px] transition hover:text-acid"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-start gap-3">
            <HoloSeal hash={badge.anonId ?? badge.kind} size={28} />
            <div className="flex-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={`Reply as $${symbol}…`}
                className="w-full resize-none border-0 bg-transparent text-[13px] leading-relaxed text-text placeholder:text-muted-2 focus:outline-none"
              />
              {err && (
                <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-[12px] text-danger">
                  {err}
                </div>
              )}
              <div className="mt-2 flex items-center justify-end border-t border-line pt-2">
                <button
                  onClick={submit}
                  disabled={busy || !text.trim()}
                  className="scribble-btn scribble-btn--primary"
                >
                  {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />}
                  {busy ? "Posting…" : "Reply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="scribble-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-text">Join the conversation</div>
            <p className="mt-1 text-[12px] leading-relaxed text-text-2">
              Claim a badge for any token you hold and reply anonymously.
            </p>
          </div>
          <button
            onClick={() => setClaiming(true)}
            className="scribble-btn scribble-btn--primary whitespace-nowrap"
          >
            Claim a badge
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-[13px] text-muted">
          <span className="font-numeric text-text-2">{comments.length}</span>{" "}
          {comments.length === 1 ? "reply" : "replies"} · sorted by score
        </h2>
        {top.length === 0 ? (
          <div className="scribble-card-flat px-4 py-8 text-center text-[13px] text-muted">
            No replies yet. Be the first.
          </div>
        ) : (
          <ul className="scribble-card overflow-hidden">
            {top.map((c) => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <CommentNode comment={c} children={childrenOf(c.id)} onReply={() => setReplyTo(c.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function CommentNode({
  comment,
  children,
  onReply,
}: {
  comment: Comment;
  children: Comment[];
  onReply: () => void;
}) {
  const meta = tokenFor(comment.badgeKind);
  const symbol = meta ? meta.symbol : comment.badgeKind;

  return (
    <div className="p-4">
      <header className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <HoloSeal hash={comment.authorAnonId} size={16} />
        <Link
          href={`/u/${comment.authorAnonId}`}
          className="rounded px-0.5 transition hover:text-acid"
        >
          {comment.displayName ? (
            <span className="font-medium text-text">@{comment.displayName}</span>
          ) : (
            <span className="font-numeric text-[12px] text-text-2">{comment.authorAnonId}</span>
          )}
        </Link>
        <span className="text-muted-2">·</span>
        <span className="scribble-chip" style={{ padding: "2px 6px 2px 4px", fontSize: 11 }}>
          <TokenIcon kind={comment.badgeKind} size={12} />
          <span>${symbol}</span>
        </span>
        <span className="text-muted-2">·</span>
        <span>{timeAgo(comment.createdAt)}</span>
        <button
          onClick={onReply}
          className="ml-auto rounded px-2 py-0.5 text-[13px] transition hover:text-acid"
        >
          Reply
        </button>
      </header>
      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">
        {comment.content}
      </p>

      {children.length > 0 && (
        <ul className="mt-3 space-y-2 border-l border-line pl-4">
          {children.map((child) => (
            <li key={child.id}>
              <ChildComment comment={child} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChildComment({ comment }: { comment: Comment }) {
  const meta = tokenFor(comment.badgeKind);
  const symbol = meta ? meta.symbol : comment.badgeKind;
  return (
    <div className="rounded-lg border border-line bg-bg-2 px-3 py-2">
      <header className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <HoloSeal hash={comment.authorAnonId} size={14} />
        <Link
          href={`/u/${comment.authorAnonId}`}
          className="rounded px-0.5 transition hover:text-acid"
        >
          {comment.displayName ? (
            <span className="font-medium text-text">@{comment.displayName}</span>
          ) : (
            <span className="font-numeric text-[12px] text-text-2">{comment.authorAnonId}</span>
          )}
        </Link>
        <span className="text-muted-2">·</span>
        <span className="text-[12px] text-text-2">${symbol}</span>
        <span className="text-muted-2">·</span>
        <span>{timeAgo(comment.createdAt)}</span>
      </header>
      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text">
        {comment.content}
      </p>
    </div>
  );
}

