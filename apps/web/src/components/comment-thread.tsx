"use client";

import Link from "next/link";
import { useState } from "react";
import { api, type Comment } from "@/lib/api";
import { timeAgo, paragraphs } from "@/lib/format";
import { netScore } from "@/lib/scoring";
import { useBadge } from "./badge-context";
import { ClaimDialog } from "./claim-dialog";

interface Props {
  postId: string;
  comments: Comment[];
  onCommentPosted?: () => void;
}

/**
 * Warm-editorial comment thread. Presentation-only restyle of the original:
 * the data flow (useBadge, api.createComment, api.reactComment, the parentId
 * tree) is untouched. Voting is surfaced as upvote-only — a single ▲ with the
 * net score — matching the BlindSol forum design. Replies nest to any depth via
 * the recursive <Reply> component (`.kids .kids` indents).
 */
export function CommentThread({ postId, comments, onCommentPosted }: Props) {
  const { badge, active } = useBadge();
  const [claiming, setClaiming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [rootText, setRootText] = useState("");
  const [rootErr, setRootErr] = useState<string | null>(null);

  const childrenOf = (id: string | null) =>
    comments.filter((c) => c.parentId === id);
  const top = childrenOf(null);
  const meId = active?.anonId ?? null;

  async function postReply(content: string, parentId?: string): Promise<boolean> {
    if (!badge) {
      setRootErr("Claim a badge to reply");
      return false;
    }
    const text = content.trim();
    if (!text) return false;
    await api.createComment(badge.badgeToken, postId, text, parentId);
    onCommentPosted?.();
    return true;
  }

  async function submitRoot() {
    if (!rootText.trim() || posting) return;
    setPosting(true);
    setRootErr(null);
    try {
      const ok = await postReply(rootText);
      if (ok) setRootText("");
    } catch (e) {
      setRootErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <section>
      {claiming && <ClaimDialog onClose={() => setClaiming(false)} />}

      <h2 className="cmthead">
        {comments.length} {comments.length === 1 ? "comment" : "comments"}
      </h2>

      {badge ? (
        <form
          className="compose inline"
          onSubmit={(e) => {
            e.preventDefault();
            submitRoot();
          }}
        >
          <textarea
            className="cta-ta"
            value={rootText}
            onChange={(e) => setRootText(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Add to the conversation…"
          />
          {rootErr && <p className="nocmt">{rootErr}</p>}
          <div className="cbar">
            <span className="as">as {badge.anonId ?? badge.kind}</span>
            <div className="cact">
              <button
                type="submit"
                className="btn solid"
                disabled={posting || !rootText.trim()}
              >
                {posting ? "Posting…" : "Reply"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div className="compose card">
          <p className="cstat">
            Claim a badge for any token you hold to reply anonymously.
          </p>
          <div className="cact">
            <button className="btn solid" onClick={() => setClaiming(true)}>
              Claim a badge
            </button>
          </div>
        </div>
      )}

      {top.length === 0 ? (
        <p className="nocmt">No replies yet. Be the first to push back.</p>
      ) : (
        <div className="kids">
          {top.map((c) => (
            <Reply
              key={c.id}
              comment={c}
              postId={postId}
              meId={meId}
              childrenOf={childrenOf}
              onReply={postReply}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Reply({
  comment,
  postId,
  meId,
  childrenOf,
  onReply,
}: {
  comment: Comment;
  postId: string;
  meId: string | null;
  childrenOf: (id: string | null) => Comment[];
  onReply: (content: string, parentId?: string) => Promise<boolean>;
}) {
  const { badge } = useBadge();
  const kids = childrenOf(comment.id);
  const isMe = !!meId && meId === comment.authorAnonId;

  const [score, setScore] = useState(
    netScore({ upCount: comment.upCount, downCount: comment.downCount }),
  );
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upvote() {
    if (!badge || busy || voted) return;
    setBusy(true);
    try {
      const r = await api.reactComment(badge.badgeToken, comment.id, "up");
      if (r.created) {
        setScore((n) => n + 1);
        setVoted(true);
      }
    } catch {
      // swallow — a failed vote leaves the count unchanged
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!text.trim() || posting) return;
    setPosting(true);
    setErr(null);
    try {
      const ok = await onReply(text, comment.id);
      if (ok) {
        setText("");
        setOpen(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="reply">
      <div className="rline">
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

        <div className="rbody">
          <div className="rmeta">
            <Link className="by" href={`/u/${comment.authorAnonId}`}>
              {comment.displayName ? `@${comment.displayName}` : comment.authorAnonId}
              {isMe && <span className="tagyou"> you</span>}
            </Link>{" "}
            · <span>{timeAgo(comment.createdAt)}</span>
          </div>

          <div className="rtext">
            {paragraphs(comment.content).map((p, i) => (
              <p key={i} className="preserve-line">
                {p}
              </p>
            ))}
          </div>

          <div className="ract">
            <button className="link" onClick={() => setOpen((v) => !v)}>
              reply
            </button>
          </div>

          {open && badge && (
            <form
              className="compose inline"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <textarea
                className="cta-ta"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Reply…"
                autoFocus
              />
              {err && <p className="nocmt">{err}</p>}
              <div className="cbar">
                <span className="as">as {badge.anonId ?? badge.kind}</span>
                <div className="cact">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setOpen(false);
                      setText("");
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn solid"
                    disabled={posting || !text.trim()}
                  >
                    {posting ? "Posting…" : "Reply"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {kids.length > 0 && (
        <div className="kids">
          {kids.map((child) => (
            <Reply
              key={child.id}
              comment={child}
              postId={postId}
              meId={meId}
              childrenOf={childrenOf}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}
