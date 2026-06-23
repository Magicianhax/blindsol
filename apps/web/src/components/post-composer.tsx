"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignTransaction, useWallets } from "@privy-io/react-auth/solana";
import { VersionedTransaction } from "@solana/web3.js";
import { api } from "@/lib/api";
import { getConnection } from "@/lib/solana";
import { useBadge } from "./badge-context";
import { ClaimDialog } from "./claim-dialog";
import { tokenFor } from "@/lib/tokens";

type Stage = "idle" | "preparing" | "signing" | "confirming" | "finalizing";

const stageCopy: Record<Stage, string> = {
  idle: "Post",
  preparing: "Preparing…",
  signing: "Approve in wallet…",
  confirming: "Confirming…",
  finalizing: "Posting…",
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
          title="Claim a badge to start posting"
          body={
            <>
              Pick a community whose token you actually hold. We check on-chain, then hand you an
              anonymous identity tied to that bag — never to your wallet.
            </>
          }
          actionLabel={requiredKind ? `Claim $${symbol}` : "Pick a badge"}
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
          title={`You don’t hold $${symbol}`}
          body={
            <>
              This community is for verified <span className="font-semibold text-text">${symbol}</span>{" "}
              holders. Claim a $<span>{symbol}</span> badge to post here, or browse the rest of the feed under one
              of your existing badges.
            </>
          }
          actionLabel={`Claim $${symbol}`}
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
          title="Pick a badge to post under"
          body="You have badges in your purse — switch to one in the header dropdown."
          actionLabel="Claim another"
          onAction={() => setClaiming(requiredKind ?? "jup_holder")}
        />
      </>
    );
  }
  if (!authenticated || !wallet) {
    return (
      <>
        {claimDialog}
        <Notice title="Connect your wallet to post">
          Your wallet stays in the enclave — only the badge gets attached to what you say.
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
        className="flex w-full items-center gap-3 rounded-lg border border-line bg-bg px-3 py-2 text-left transition hover:border-line-2"
      >
        <span className="flex-1 truncate text-[13px] text-muted">
          Post to <span className="font-medium text-text-2">${meta?.symbol ?? badge.kind}</span>…
        </span>
        <span className="scribble-btn scribble-btn--primary pointer-events-none px-2.5 py-1 text-[12px]">
          New post
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-bg p-3.5">
      <div className="mb-2 flex flex-wrap items-center gap-x-1.5 border-b border-line pb-2 text-[12px] text-muted">
        Posting to <span className="font-medium text-text">${meta?.symbol ?? badge.kind}</span>
        <span className="text-muted-2">·</span>
        <span>verified holder, wallet sealed</span>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        disabled={busy}
        maxLength={160}
        className="w-full border-0 bg-transparent py-1 text-[18px] font-semibold text-text placeholder:text-muted-2 focus:outline-none disabled:opacity-50"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Write your post… be specific, holders pay attention."
        disabled={busy}
        maxLength={2000}
        className="mt-1 w-full resize-none border-0 bg-transparent text-[14px] leading-relaxed text-text-2 placeholder:text-muted-2 focus:outline-none disabled:opacity-50"
      />

      {err && (
        <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
          Error: {err}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
        <span
          className={`font-numeric text-[12px] ${
            remainingTitle < 0 ? "text-danger" : "text-muted-2"
          }`}
        >
          {remainingTitle}
        </span>
        <span
          className={`font-numeric text-[12px] ${
            remainingBody < 0 ? "text-danger" : "text-muted-2"
          }`}
        >
          {remainingBody}
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
    <div className="rounded-xl border border-line bg-bg p-4 shadow-sm">
      <div className="text-[15px] font-semibold text-text">{title}</div>
      <div className="mt-1.5 text-[13px] leading-relaxed text-muted">{children}</div>
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
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-text">{title}</div>
        <div className="mt-1.5 text-[13px] leading-relaxed text-muted">{body}</div>
      </div>
      <button onClick={onAction} className="scribble-btn scribble-btn--primary whitespace-nowrap">
        {actionLabel}
      </button>
    </div>
  );
}
