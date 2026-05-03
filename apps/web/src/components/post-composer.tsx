"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { VersionedTransaction } from "@solana/web3.js";
import { api } from "@/lib/api";
import { getConnection } from "@/lib/solana";
import { useBadge } from "./badge-context";
import { ClaimDialog } from "./claim-dialog";
import { TokenIcon } from "./token-icon";
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
          each post is $0.05 USDC, paid privately through MagicBlock&apos;s rails.
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
        receipt: prepared.stakeBond.receipt,
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
        className="scribble-card flex w-full items-center gap-3 px-4 py-3 text-left transition hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-pen-lg"
      >
        <TokenIcon kind={badge.kind} size={28} />
        <span className="flex-1 font-display text-xl text-ink">
          start a thread as <span className="text-crayon-blue">${meta?.symbol ?? badge.kind}</span>…
        </span>
        <span className="rounded-full border-2 border-ink bg-crayon-yellow px-2.5 py-0.5 font-display text-base">
          $0.05 USDC
        </span>
      </button>
    );
  }

  return (
    <div className="scribble-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <TokenIcon kind={badge.kind} size={24} />
        <span className="font-display text-lg text-ink">${meta?.symbol ?? badge.kind}</span>
        <span className="ml-auto font-display text-sm text-muted">private settlement · $0.05 USDC</span>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="title — what's the deal?"
        disabled={busy}
        maxLength={160}
        className="w-full border-0 bg-transparent py-1 font-display text-2xl text-ink placeholder:text-muted focus:outline-none disabled:opacity-50"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="optional body. spill the alpha. ask the question. paste the receipt."
        disabled={busy}
        maxLength={2000}
        className="mt-1 w-full resize-none border-0 bg-transparent text-[15px] leading-relaxed text-text placeholder:text-muted focus:outline-none disabled:opacity-50"
      />

      {err && (
        <div className="mt-2 rounded-lg border-2 border-crayon-red bg-crayon-red/10 px-3 py-2 text-sm text-crayon-red">
          oops — {err}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 border-t-2 border-dashed border-border-soft pt-3">
        <span className={`font-mono text-sm tabular-nums ${remainingTitle < 0 ? "text-crayon-red" : "text-muted"}`}>
          title {remainingTitle}
        </span>
        <span className={`font-mono text-sm tabular-nums ${remainingBody < 0 ? "text-crayon-red" : "text-muted"}`}>
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
          nevermind
        </button>
        <button
          onClick={submit}
          disabled={busy || !canSubmit}
          className="scribble-btn scribble-btn--primary"
        >
          {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {stageCopy[stage]}
        </button>
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="scribble-card p-4">
      <div className="font-display text-2xl text-ink">{title}</div>
      <div className="mt-1 text-[15px] leading-snug text-text-2">{children}</div>
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
    <div className="scribble-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="font-display text-2xl text-ink">{title}</div>
        <div className="mt-1 text-[15px] leading-snug text-text-2">{body}</div>
      </div>
      <button onClick={onAction} className="scribble-btn scribble-btn--yellow whitespace-nowrap">
        {actionLabel}
      </button>
    </div>
  );
}
