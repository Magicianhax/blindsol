"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { VersionedTransaction } from "@solana/web3.js";
import { api } from "@/lib/api";
import { getConnection } from "@/lib/solana";
import { useBadge } from "./badge-context";
import { ClaimDialog } from "./claim-dialog";
import { HoloSeal } from "./holo-seal";
import { tokenFor } from "@/lib/tokens";

type Stage = "idle" | "preparing" | "signing" | "confirming" | "finalizing";

const stageCopy: Record<Stage, string> = {
  idle: "post it",
  preparing: "preparing…",
  signing: "approve in wallet…",
  confirming: "confirming…",
  finalizing: "posting…",
};

export function PostComposer({
  onPosted,
  requiredKind,
}: {
  onPosted?: () => void;
  /**
   * If set, the user must hold a badge of this kind to post. When the user
   * is filtering the feed to a specific community, pass the filter through;
   * the composer locks itself if they don't own a matching badge.
   */
  requiredKind?: string;
}) {
  const { badge, badges } = useBadge();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet = wallets[0];
  const connection = getConnection();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  // Claim-prompt with a pre-selected token (rendered alongside any composer state).
  const claimDialog = claiming ? (
    <ClaimDialog onClose={() => setClaiming(null)} preselectKind={claiming} />
  ) : null;

  // First-time visitors with no badges at all → friendly invite.
  if (badges.length === 0) {
    const target = requiredKind ?? "jup_holder";
    const meta = tokenFor(target);
    const symbol = meta?.symbol ?? target;
    return (
      <>
        {claimDialog}
        <CallToAction
          title="claim a badge to start posting"
          body={
            <>
              pick a community whose token you actually hold. we check on-chain, then hand you an
              anonymous identity tied to that bag — never to your wallet.
            </>
          }
          actionLabel={requiredKind ? `claim $${symbol}` : "pick a badge"}
          onAction={() => setClaiming(target)}
        />
      </>
    );
  }

  // Filter to a community the user does NOT hold a badge for.
  if (requiredKind && !badges.some((b) => b.kind === requiredKind)) {
    const meta = tokenFor(requiredKind);
    const symbol = meta?.symbol ?? requiredKind;
    return (
      <>
        {claimDialog}
        <CallToAction
          title={`you don’t hold $${symbol}`}
          body={
            <>
              this community is for verified <span className="font-display text-lg text-ink">${symbol}</span>{" "}
              holders. claim a $<span>{symbol}</span> badge to post here, or browse the rest of the feed under one
              of your existing badges.
            </>
          }
          actionLabel={`claim $${symbol}`}
          onAction={() => setClaiming(requiredKind)}
        />
      </>
    );
  }

  if (!badge) {
    // Defensive: badges.length>0 but no active selected. Shouldn't normally happen.
    return (
      <>
        {claimDialog}
        <CallToAction
          title="pick a badge to post under"
          body="you have badges in your purse — switch to one in the header dropdown."
          actionLabel="claim another"
          onAction={() => setClaiming(requiredKind ?? "jup_holder")}
        />
      </>
    );
  }
  if (!authenticated || !wallet) {
    return (
      <>
        {claimDialog}
        <Notice title="connect your wallet to post">
          your wallet stays in the enclave — only the badge gets attached to what you say.
        </Notice>
      </>
    );
  }

  const meta = tokenFor(badge.kind);
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const remainingTitle = 160 - trimmedTitle.length;
  const remainingBody = 2000 - trimmedBody.length;
  const overLimit = remainingTitle < 0 || remainingBody < 0;
  const canSubmit = trimmedTitle.length > 0 && !overLimit;
  const busy = stage !== "idle";

  async function submit() {
    if (!badge || !wallet) return;
    if (!canSubmit) return;
    setErr(null);
    try {
      setStage("preparing");
      const prepared = await api.preparePost(badge.badgeToken, {
        title: trimmedTitle,
        content: trimmedBody,
        fromWallet: wallet.address,
      });
      setStage("signing");
      const txBytes = Uint8Array.from(
        atob(prepared.stakeBond.unsignedTransactionBase64),
        (c) => c.charCodeAt(0),
      );
      const { signedTransaction } = await signTransaction({
        transaction: txBytes,
        wallet,
      });
      // Privy returns the signed tx as raw bytes; deserialize to a
      // VersionedTransaction just to validate, then send the bytes directly.
      VersionedTransaction.deserialize(signedTransaction);
      setStage("confirming");
      const signature = await connection.sendRawTransaction(signedTransaction, { skipPreflight: false });
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
        receiptId: prepared.stakeBond.receiptId,
        txSignature: signature,
        title: trimmedTitle,
        content: trimmedBody,
      });
      setTitle("");
      setBody("");
      setOpen(false);
      setStage("idle");
      onPosted?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStage("idle");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md border border-line bg-bg-2 px-4 py-3 text-left transition hover:border-line-2"
      >
        <HoloSeal hash={badge.anonId ?? badge.kind} size={26} />
        <span className="flex-1 truncate font-mono text-[13px] text-text-2">
          start a thread as <span className="text-text">${meta?.symbol ?? badge.kind}</span>…
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
          new thread
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-md border border-line bg-bg-2 p-4">
      <div className="mb-3 flex items-center gap-2 border-b border-line pb-3">
        <HoloSeal hash={badge.anonId ?? badge.kind} size={26} />
        <div className="flex flex-col leading-tight">
          <span className="font-mono text-[12px] text-text">${meta?.symbol ?? badge.kind}</span>
          <span className="font-mono text-[10px] text-muted-2">verified holder · wallet sealed</span>
        </div>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="title · what's the thread about?"
        disabled={busy}
        maxLength={160}
        className="w-full border-0 bg-transparent py-1 font-mono text-[16px] font-medium text-text placeholder:text-muted-2 focus:outline-none disabled:opacity-50"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="body · be specific. holders pay attention."
        disabled={busy}
        maxLength={2000}
        className="mt-1 w-full resize-none border-0 bg-transparent font-mono text-[13px] leading-relaxed text-text-2 placeholder:text-muted-2 focus:outline-none disabled:opacity-50"
      />

      {err && (
        <div className="mt-2 rounded border border-danger/40 bg-danger/10 px-3 py-2 font-mono text-[12px] text-danger">
          oops — {err}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.06em] tabular-nums ${
            remainingTitle < 0 ? "text-danger" : "text-muted"
          }`}
        >
          title {remainingTitle}
        </span>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.06em] tabular-nums ${
            remainingBody < 0 ? "text-danger" : "text-muted"
          }`}
        >
          body {remainingBody}
        </span>
        <button
          onClick={() => {
            setOpen(false);
            setTitle("");
            setBody("");
            setErr(null);
          }}
          disabled={busy}
          className="ml-auto scribble-btn scribble-btn--ghost"
        >
          cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className="scribble-btn scribble-btn--primary"
        >
          {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />}
          {stageCopy[stage]}
        </button>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-bg-2 p-4">
      <div className="font-mono text-[14px] font-medium text-text">{title}</div>
      <div className="mt-1.5 font-mono text-[12px] leading-relaxed text-text-2">{children}</div>
    </div>
  );
}

function CallToAction({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-bg-2 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[14px] font-medium text-text">{title}</div>
        <div className="mt-1.5 font-mono text-[12px] leading-relaxed text-text-2">{body}</div>
      </div>
      <button onClick={onAction} className="scribble-btn scribble-btn--primary whitespace-nowrap">
        {actionLabel}
      </button>
    </div>
  );
}
