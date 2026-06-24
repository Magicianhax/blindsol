"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TopNav } from "@/components/top-nav";
import { RoomNav } from "@/components/room-nav";
import { CommentThread } from "@/components/comment-thread";
import { TokenChip } from "@/components/token-chip";
import { Seal } from "@/components/seal";
import { useBadge } from "@/components/badge-context";
import { SiteFooter } from "@/components/site-footer";
import { tokenFor } from "@/lib/tokens";
import { timeAgo, deriveTitle, paragraphs, titleAndBody } from "@/lib/format";
import { netScore } from "@/lib/scoring";
import { api, type Comment, type Post, type Reaction } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
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

  const symbol = post ? tokenFor(post.badgeKind)?.symbol ?? post.badgeKind : null;

  return (
    <>
      <TopNav />
      <RoomNav activeRoom={post?.badgeKind} />
      <main className="bs-main">
        <Link
          className="back"
          href={post ? `/forum?room=${post.badgeKind}` : "/forum"}
        >
          {symbol ? `← $${symbol}` : "← all rooms"}
        </Link>

        {err && <p className="nocmt">Error: {err}</p>}

        {loading && !post && <p className="nocmt">Loading…</p>}

        {post && (
          <ThreadDetail
            post={post}
            commentCount={comments.length}
            upCount={upCount}
            downCount={downCount}
            onVoted={refresh}
          />
        )}

        {post && (
          <div id="comments">
            <CommentThread
              postId={post.id}
              comments={comments}
              onCommentPosted={refresh}
            />
          </div>
        )}

        <SiteFooter />
      </main>
    </>
  );
}

function ThreadDetail({
  post,
  commentCount,
  upCount,
  downCount,
  onVoted,
}: {
  post: Post;
  commentCount: number;
  upCount: number;
  downCount: number;
  onVoted: () => void;
}) {
  const { badge } = useBadge();
  const symbol = tokenFor(post.badgeKind)?.symbol ?? post.badgeKind;
  const { title, body } = titleAndBody(post);
  const headline = title || deriveTitle(post.content);

  const [score, setScore] = useState(netScore({ upCount, downCount }));
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upvote() {
    if (!badge || busy || voted) return;
    setBusy(true);
    try {
      const r = await api.react(badge.badgeToken, post.id, "up");
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

  return (
    <article className="op">
      <h1>{headline || "(empty post)"}</h1>

      <div className="opmeta">
        <Seal hash={post.authorAnonId} size={30} />
        <Link className="by" href={`/u/${post.authorAnonId}`}>
          {post.displayName ? `@${post.displayName}` : post.authorAnonId}
        </Link>{" "}
        ·{" "}
        <Link className="room" href={`/forum?room=${post.badgeKind}`}>
          <TokenChip kind={post.badgeKind} />
        </Link>{" "}
        · <span>{timeAgo(post.createdAt)}</span>
      </div>

      {body && (
        <div className="optext">
          {paragraphs(body).map((p, i) => (
            <p key={i} className="preserve-line">
              {p}
            </p>
          ))}
        </div>
      )}

      <div className="opact">
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
        <a className="link" href="#comments">
          reply
        </a>
        <span className="cstat">
          {commentCount} {commentCount === 1 ? "comment" : "comments"}
        </span>
        {!badge && symbol && (
          <span className="cstat">claim a ${symbol} badge to vote</span>
        )}
      </div>
    </article>
  );
}
