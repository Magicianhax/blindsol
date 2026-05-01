"use client";

import { useState } from "react";
import { api, BADGE_LABELS, type Comment } from "@/lib/api";
import { useBadge } from "./badge-context";

interface Props {
  postId: string;
  comments: Comment[];
  onCommentPosted?: () => void;
}

export function CommentThread({ postId, comments, onCommentPosted }: Props) {
  const { badge } = useBadge();
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  // Build a simple tree.
  const top = comments.filter((c) => !c.parentId);
  const childrenOf = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-border bg-panel p-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            replying to comment <span className="font-mono">{replyTo.slice(0, 8)}</span>
            <button onClick={() => setReplyTo(null)} className="hover:text-white">
              cancel
            </button>
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={badge ? "Reply…" : "Claim a badge to reply"}
          disabled={!badge}
          className="w-full resize-none rounded-md border border-border bg-bg p-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
        />
        {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
        <div className="mt-2 flex justify-end">
          <button
            onClick={submit}
            disabled={busy || !text.trim() || !badge}
            className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-black hover:bg-accent/80 disabled:bg-border disabled:text-muted"
          >
            {busy ? "Posting…" : "Reply"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {top.length === 0 && <div className="text-sm text-muted">No replies yet.</div>}
        {top.map((c) => (
          <CommentNode
            key={c.id}
            comment={c}
            children={childrenOf(c.id)}
            onReply={() => setReplyTo(c.id)}
          />
        ))}
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
  const label = BADGE_LABELS[comment.badgeKind] ?? comment.badgeKind;
  return (
    <div className="rounded-md border border-border bg-panel p-3">
      <header className="mb-1 flex items-baseline justify-between text-xs text-muted">
        <div>
          <span className="font-mono text-accent">{label}</span>
          <span className="mx-2">·</span>
          <span className="font-mono">{comment.authorAnonId}</span>
        </div>
        <button onClick={onReply} className="text-xs hover:text-accent">
          reply
        </button>
      </header>
      <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
      {children.length > 0 && (
        <div className="mt-3 space-y-2 border-l border-border pl-3">
          {children.map((child) => (
            <div key={child.id} className="rounded-md bg-bg p-2">
              <header className="mb-1 text-xs text-muted">
                <span className="font-mono text-accent">
                  {BADGE_LABELS[child.badgeKind] ?? child.badgeKind}
                </span>
                <span className="mx-2">·</span>
                <span className="font-mono">{child.authorAnonId}</span>
              </header>
              <p className="whitespace-pre-wrap text-sm">{child.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
