"use client";

import { useState } from "react";
import { api, type Comment } from "@/lib/api";
import { tokenFor } from "@/lib/tokens";
import { TokenIcon } from "./token-icon";
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
      setErr("claim a badge to reply");
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
        <div className="scribble-card p-3">
          {replyTo && (
            <div className="mb-2 flex items-center justify-between text-sm text-muted">
              <span>
                ↳ replying to <span className="font-mono text-ink">{replyTo.slice(0, 8)}</span>
              </span>
              <button onClick={() => setReplyTo(null)} className="font-display text-base hover:text-ink">
                cancel
              </button>
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={`reply as $${symbol}…`}
            className="w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed text-ink placeholder:text-muted focus:outline-none"
          />
          {err && (
            <div className="mt-2 rounded-lg border-2 border-crayon-red bg-crayon-red/10 px-3 py-1.5 text-sm text-crayon-red">
              oops — {err}
            </div>
          )}
          <div className="mt-2 flex items-center justify-end gap-2 border-t-2 border-dashed border-border-soft pt-2">
            <button
              onClick={submit}
              disabled={busy || !text.trim()}
              className="scribble-btn scribble-btn--primary"
            >
              {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {busy ? "posting…" : "reply"}
            </button>
          </div>
        </div>
      ) : (
        <div className="scribble-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl text-ink">join the conversation</div>
            <p className="mt-0.5 text-[14px] leading-snug text-text-2">
              claim a badge for any token you hold and reply anonymously.
            </p>
          </div>
          <button
            onClick={() => setClaiming(true)}
            className="scribble-btn scribble-btn--yellow whitespace-nowrap"
          >
            claim a badge
          </button>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-display text-2xl text-ink">
          <span className="scribble-underline">
            {comments.length} {comments.length === 1 ? "reply" : "replies"}
          </span>
        </h2>
        {top.length === 0 ? (
          <div className="scribble-card-flat px-4 py-6 text-center text-base text-muted">
            no replies yet. be the brave one.
          </div>
        ) : (
          <ul className="space-y-3">
            {top.map((c) => (
              <li key={c.id}>
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
  const symbol = meta ? `$${meta.symbol}` : comment.badgeKind;

  return (
    <div className="scribble-card-flat p-3">
      <header className="mb-1 flex items-center gap-2 text-[13px] text-muted">
        <TokenIcon kind={comment.badgeKind} size={20} />
        <span className="font-display text-base text-ink">{symbol}</span>
        <span className="text-muted-2">·</span>
        <span className="font-mono text-[12px]">{comment.authorAnonId}</span>
        <span className="text-muted-2">·</span>
        <span>{timeAgo(comment.createdAt)}</span>
        <button onClick={onReply} className="ml-auto rounded px-1.5 py-0.5 font-display text-base transition hover:bg-surface-2 hover:text-ink">
          reply
        </button>
      </header>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-ink">{comment.content}</p>

      {children.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-dashed border-border-soft pl-3">
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
  const symbol = meta ? `$${meta.symbol}` : comment.badgeKind;
  return (
    <div className="rounded-lg border-2 border-dashed border-border-soft bg-surface-2/50 px-3 py-2">
      <header className="mb-1 flex items-center gap-2 text-[13px] text-muted">
        <TokenIcon kind={comment.badgeKind} size={18} />
        <span className="font-display text-base text-ink">{symbol}</span>
        <span className="text-muted-2">·</span>
        <span className="font-mono text-[12px]">{comment.authorAnonId}</span>
        <span className="text-muted-2">·</span>
        <span>{timeAgo(comment.createdAt)}</span>
      </header>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-ink">{comment.content}</p>
    </div>
  );
}
