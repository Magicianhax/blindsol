"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { ThreadRow } from "@/components/thread-row";
import { TokenIcon } from "@/components/token-icon";
import { HoloSeal, VerifiedDot } from "@/components/holo-seal";
import { tokenFor } from "@/lib/tokens";
import { api, ApiError, type Comment, type Post, type UserProfile } from "@/lib/api";

interface PageProps {
  params: Promise<{ handle: string }>;
}

type Tab = "posts" | "comments";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function ProfilePage({ params }: PageProps) {
  const { handle } = use(params);
  const [anonId, setAnonId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<Tab>("posts");
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const resolved = handle.startsWith("anon_")
        ? { anonId: handle, username: null as string | null }
        : await api.resolveHandle(handle);
      setAnonId(resolved.anonId);

      const [p, listPosts, listComments] = await Promise.all([
        api.getUser(resolved.anonId),
        api.getUserPosts(resolved.anonId),
        api.getUserComments(resolved.anonId),
      ]);
      setProfile(p);
      setPosts(listPosts.posts);
      setComments(listComments.comments);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setErr("not_found");
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Link href="/" className="scribble-btn scribble-btn--ghost mb-5 inline-flex">
          <BackIcon />
          back
        </Link>

        {err === "not_found" ? (
          <NotFound handle={handle} />
        ) : err ? (
          <div className="rounded border border-danger/40 bg-danger/10 p-3 font-mono text-[12px] text-danger">
            oops — {err}
          </div>
        ) : loading || !profile ? (
          <div className="scribble-card p-10 text-center font-mono text-[13px] text-muted">
            loading…
          </div>
        ) : (
          <>
            <ProfileHeader profile={profile} anonId={anonId ?? handle} />

            <div className="my-5 flex gap-2 border-b border-line">
              <TabButton
                active={tab === "posts"}
                onClick={() => setTab("posts")}
                label="posts"
                count={posts.length}
              />
              <TabButton
                active={tab === "comments"}
                onClick={() => setTab("comments")}
                label="comments"
                count={comments.length}
              />
            </div>

            {tab === "posts" ? <PostsList posts={posts} /> : <CommentsList comments={comments} />}
          </>
        )}
      </main>
    </>
  );
}

function ProfileHeader({ profile, anonId }: { profile: UserProfile; anonId: string }) {
  const meta = profile.badgeKind ? tokenFor(profile.badgeKind) : null;
  const symbol = meta?.symbol ?? profile.badgeKind ?? "anon";

  return (
    <div className="scribble-card flex flex-wrap items-center gap-5 p-6">
      <HoloSeal hash={anonId} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="font-mono text-[24px] font-medium leading-tight tracking-tight text-text">
            {profile.username ? `@${profile.username}` : (
              <span className="font-mono text-[16px] text-text-2">{anonId}</span>
            )}
          </h1>
          {profile.badgeKind ? (
            <span className="scribble-chip" style={{ padding: "3px 8px 3px 5px" }}>
              <TokenIcon kind={profile.badgeKind} size={14} />
              <span>${symbol}</span>
            </span>
          ) : null}
          <VerifiedDot />
        </div>
        {profile.username && (
          <p className="mt-1.5 break-all font-mono text-[11px] text-muted">{anonId}</p>
        )}
        <p className="mt-2 font-mono text-[12px] text-text-2">
          <span className="text-text">{profile.postCount}</span> posts ·{" "}
          <span className="text-text">{profile.commentCount}</span> comments
          {profile.firstSeen ? ` · joined ${timeAgo(profile.firstSeen)}` : ""}
        </p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px rounded-t px-4 py-2.5 font-mono text-[12px] uppercase tracking-[0.06em] transition ${
        active
          ? "border-b-2 border-acid text-acid"
          : "border-b-2 border-transparent text-muted hover:text-text"
      }`}
    >
      {label}{" "}
      <span className="font-mono text-[11px] text-muted-2">{count}</span>
    </button>
  );
}

function PostsList({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="scribble-card-flat p-10 text-center font-mono text-[13px] text-muted">
        no threads yet.
      </div>
    );
  }
  return (
    <div className="scribble-card overflow-hidden">
      <ul>
        {posts.map((p) => (
          <li key={p.id}>
            <ThreadRow post={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommentsList({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) {
    return (
      <div className="scribble-card-flat p-10 text-center font-mono text-[13px] text-muted">
        no comments yet.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {comments.map((c) => {
        const meta = tokenFor(c.badgeKind);
        const symbol = meta?.symbol ?? c.badgeKind;
        return (
          <li key={c.id}>
            <Link
              href={`/post/${c.postId}`}
              className="scribble-card-flat block px-4 py-3 transition hover:border-line-2"
            >
              <header className="flex items-center gap-2 font-mono text-[11px] text-muted">
                <TokenIcon kind={c.badgeKind} size={14} />
                <span className="text-text">${symbol}</span>
                <span className="text-muted-2">·</span>
                <span>{timeAgo(c.createdAt)}</span>
                <span className="ml-auto text-[10px] uppercase tracking-[0.06em] text-acid">
                  in thread →
                </span>
              </header>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-text">
                {c.content}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function NotFound({ handle }: { handle: string }) {
  return (
    <div className="scribble-card p-10 text-center">
      <h1 className="font-mono text-[20px] font-medium text-text">no such handle</h1>
      <p className="mt-2 font-mono text-[13px] text-text-2">
        couldn&apos;t resolve <span className="text-text">{handle}</span>. check the spelling, or it
        may have been released.
      </p>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M13 8H3M7 4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
