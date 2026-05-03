"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { TopNav } from "@/components/top-nav";
import { ThreadRow } from "@/components/thread-row";
import { TokenIcon } from "@/components/token-icon";
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
      // Resolve handle → anon. If the URL already starts with `anon_`,
      // use it directly; otherwise look up the username.
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
        <Link href="/" className="scribble-btn scribble-btn--ghost mb-4 inline-flex">
          <BackIcon />
          back
        </Link>

        {err === "not_found" ? (
          <NotFound handle={handle} />
        ) : err ? (
          <div className="rounded-lg border-2 border-crayon-red bg-crayon-red/10 p-3 text-sm text-crayon-red">
            oops — {err}
          </div>
        ) : loading || !profile ? (
          <div className="scribble-card p-6 text-center font-display text-2xl text-muted">loading…</div>
        ) : (
          <>
            <ProfileHeader profile={profile} anonId={anonId ?? handle} />

            <div className="my-5 flex gap-2 border-b-2 border-dashed border-border-soft">
              <TabButton active={tab === "posts"} onClick={() => setTab("posts")} label={`posts (${posts.length})`} />
              <TabButton
                active={tab === "comments"}
                onClick={() => setTab("comments")}
                label={`comments (${comments.length})`}
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
    <div className="scribble-card flex flex-wrap items-center gap-4 px-5 py-4">
      {profile.badgeKind ? (
        <TokenIcon kind={profile.badgeKind} size={56} />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-border-soft text-2xl text-muted">
          ?
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="font-display text-3xl leading-tight text-ink">
            {profile.username ? `@${profile.username}` : (
              <span className="font-mono text-xl">{anonId}</span>
            )}
          </h1>
          {profile.badgeKind ? (
            <span className="rounded-full border-2 border-ink bg-crayon-yellow px-2 py-0.5 font-display text-sm">
              ${symbol}
            </span>
          ) : null}
        </div>
        <p className="mt-1 font-mono text-[12px] text-muted">{anonId}</p>
        <p className="mt-2 text-[13px] text-text-2">
          {profile.postCount} posts · {profile.commentCount} comments
          {profile.firstSeen ? ` · joined ${timeAgo(profile.firstSeen)}` : ""}
        </p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-0.5 rounded-t-md border-b-4 px-4 py-2 font-display text-lg transition ${
        active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function PostsList({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="scribble-card-flat p-6 text-center text-base text-muted">
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
      <div className="scribble-card-flat p-6 text-center text-base text-muted">
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
              className="scribble-card-flat block px-4 py-3 transition hover:bg-bg-2"
            >
              <header className="flex items-center gap-2 text-[12px] text-muted">
                <TokenIcon kind={c.badgeKind} size={16} />
                <span className="font-display text-sm text-ink">${symbol}</span>
                <span className="text-muted-2">·</span>
                <span>{timeAgo(c.createdAt)}</span>
                <span className="ml-auto text-[11px] text-muted">in thread →</span>
              </header>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[14px] leading-snug text-ink">
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
    <div className="scribble-card p-8 text-center">
      <h1 className="font-display text-3xl text-ink">no such handle</h1>
      <p className="mt-2 text-base text-text-2">
        couldn&apos;t resolve <span className="font-mono">{handle}</span>. Check the spelling, or it
        may have been released.
      </p>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 8H3M7 4L3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
