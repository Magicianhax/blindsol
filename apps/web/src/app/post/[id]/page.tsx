"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { PostCard } from "@/components/post-card";
import { CommentThread } from "@/components/comment-thread";
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

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Link href="/" className="text-xs text-muted hover:text-accent">
          ← Back to feed
        </Link>
        {err && <div className="rounded-md border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{err}</div>}
        {loading && <div className="text-sm text-muted">Loading…</div>}
        {post && <PostCard post={post} upCount={upCount} downCount={downCount} />}
        {post && <CommentThread postId={post.id} comments={comments} onCommentPosted={refresh} />}
      </main>
    </div>
  );
}
