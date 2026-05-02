"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { api } from "@/lib/api";
import { useBadge } from "./badge-context";

type Stage = "idle" | "preparing" | "signing" | "confirming" | "finalizing";

const stageLabel: Record<Stage, string> = {
  idle: "Post anonymously",
  preparing: "Building stake bond…",
  signing: "Sign in your wallet…",
  confirming: "Confirming on-chain…",
  finalizing: "Recording post…",
};

export function PostComposer({ onPosted }: { onPosted?: () => void }) {
  const { badge } = useBadge();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [content, setContent] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);

  if (!badge) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
        Claim a badge to start posting anonymously.
      </div>
    );
  }

  if (!publicKey) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
        Connect your wallet to post — you pay the 0.1 USDC stake bond per post.
      </div>
    );
  }

  if (!signTransaction) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted">
        Your wallet does not support transaction signing.
      </div>
    );
  }

  async function submit() {
    if (!badge) return;
    if (!publicKey || !signTransaction) return;
    if (!content.trim()) return;
    setErr(null);

    try {
      setStage("preparing");
      const prepared = await api.preparePost(badge.badgeToken, {
        content: content.trim(),
        fromWallet: publicKey.toBase58(),
      });

      setStage("signing");
      const txBytes = Uint8Array.from(atob(prepared.stakeBond.unsignedTransactionBase64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(txBytes);
      const signed = await signTransaction(tx);

      setStage("confirming");
      const signature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(
        {
          signature,
          blockhash: prepared.stakeBond.recentBlockhash,
          lastValidBlockHeight: prepared.stakeBond.lastValidBlockHeight,
        },
        "confirmed",
      );

      setStage("finalizing");
      await api.finalizePost(badge.badgeToken, {
        receipt: prepared.stakeBond.receipt,
        txSignature: signature,
        content: content.trim(),
      });

      setContent("");
      setStage("idle");
      onPosted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  const busy = stage !== "idle";

  return (
    <div className="rounded-md border border-border bg-panel p-4">
      <div className="mb-2 flex items-baseline justify-between text-xs text-muted">
        <span>
          posting as <span className="font-mono text-accent">{badge.label}</span>
        </span>
        <span className="font-mono">stake: 0.1 USDC</span>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Spill it…"
        disabled={busy}
        className="w-full resize-none rounded-md border border-border bg-bg p-2 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
      />
      {err && <div className="mt-2 text-sm text-red-400">{err}</div>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-muted">{content.length}/2000</span>
        <button
          onClick={submit}
          disabled={busy || !content.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black hover:bg-accent/80 disabled:bg-border disabled:text-muted"
        >
          {stageLabel[stage]}
        </button>
      </div>
    </div>
  );
}
