"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useBadge } from "./badge-context";

export function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const { badge } = useBadge();
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!badge) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
        Claim a badge to start posting anonymously.
      </div>
    );
  }

  async function submit() {
    if (!badge) return;
    if (!content.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.createPost(badge.badgeToken, content.trim());
      setContent("");
      onPosted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-panel p-4">
      <div className="mb-2 text-xs text-muted">
        posting as <span className="font-mono text-accent">{badge.label}</span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Spill it…"
        className="w-full resize-none rounded-md border border-border bg-bg p-2 text-sm focus:border-accent focus:outline-none"
      />
      {err && <div className="mt-2 text-sm text-red-400">{err}</div>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">{content.length}/2000</span>
        <button
          onClick={submit}
          disabled={busy || !content.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent/80 disabled:bg-border disabled:text-muted"
        >
          {busy ? "Posting…" : "Post anonymously"}
        </button>
      </div>
    </div>
  );
}
