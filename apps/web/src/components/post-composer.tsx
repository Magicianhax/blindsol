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

const MAX_TITLE_LENGTH = 160;
const MAX_BODY_LENGTH = 2000;

const stageCopy: Record<Stage, string> = {
  idle: "post thread",
  preparing: "preparing…",
  signing: "approve in wallet…",
  confirming: "confirming…",
  finalizing: "posting…",
};

export function PostComposer({
  onPosted,
  requiredKind,
  defaultOpen = false,
}: {
  onPosted?: () => void;
  /**
   * If set, the user must hold a badge of this kind to post. When the user
   * is filtering the feed to a specific community, pass the filter through;
   * the composer locks itself if they don't own a matching badge.
   */
  requiredKind?: string;
  /** Open the composer form immediately (used by the "+ new thread" entry). */
  defaultOpen?: boolean;
}) {
  const { badge, badges, setActive } = useBadge();
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const wallet = wallets[0];
  const connection = getConnection();
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const claimDialog =
    claiming !== null ? (
      <ClaimDialog onClose={() => setClaiming(null)} preselectKind={claiming || undefined} />
    ) : null;

  // First-time visitors with no badges at all → the gate. Token-specific when a
  // room is in focus, otherwise a general "claim a badge to post" gate.
  if (badges.length === 0) {
    if (requiredKind) {
      return (
        <>
          {claimDialog}
          <Gate kind={requiredKind} onUnseal={() => setClaiming(requiredKind)} />
        </>
      );
    }
    return (
      <>
        {claimDialog}
        <Gate onUnseal={() => setClaiming("")} />
      </>
    );
  }

  // Filtered to a community the user does NOT hold a badge for → the gate.
  if (requiredKind && !badges.some((b) => b.kind === requiredKind)) {
    return (
      <>
        {claimDialog}
        <Gate kind={requiredKind} onUnseal={() => setClaiming(requiredKind)} />
      </>
    );
  }

  if (!badge) {
    return (
      <>
        {claimDialog}
        <Gate kind={requiredKind} onUnseal={() => setClaiming(requiredKind ?? "")} />
      </>
    );
  }
  if (!authenticated || !wallet) {
    return (
      <>
        {claimDialog}
        <div className="compose card">
          <div className="bname compose-notice-title">Connect your wallet to post</div>
          <p className="panel-sub compose-notice-sub">
            Your wallet stays in the enclave — only the badge gets attached to what you say.
          </p>
        </div>
      </>
    );
  }

  const meta = tokenFor(badge.kind);
  const symbol = meta?.symbol ?? badge.kind;
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const remainingTitle = MAX_TITLE_LENGTH - trimmedTitle.length;
  const remainingBody = MAX_BODY_LENGTH - trimmedBody.length;
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
      <>
        {claimDialog}
        <button
          onClick={() => setOpen(true)}
          className="compose card compose-collapsed"
        >
          <span className="compose-collapsed__label">
            Start a thread in <b>${symbol}</b>…
          </span>
          <span className="btn solid pointer-events-none">+ new thread</span>
        </button>
      </>
    );
  }

  // held communities the user can post into (their badges)
  const postable = badges.filter((b, i, arr) => arr.findIndex((x) => x.kind === b.kind) === i);

  return (
    <>
      {claimDialog}
      <div className="compose card">
        <div className="crow">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A claim worth arguing with, or a real question"
            disabled={busy}
            maxLength={MAX_TITLE_LENGTH}
            className="cin"
            autoComplete="off"
          />
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Say the thing. Plain text. Be specific."
          disabled={busy}
          maxLength={MAX_BODY_LENGTH}
          className="cta-ta"
        />

        {err && (
          <div className="mt-2 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
            Error: {err}
          </div>
        )}

        <div className="cbar">
          <label className="sel">
            room{" "}
            <select
              value={badge.kind}
              disabled={busy || postable.length < 2}
              onChange={(e) => {
                const next = badges.find((b) => b.kind === e.target.value);
                if (next) setActive(next.badgeId);
              }}
            >
              {postable.map((b) => {
                const m = tokenFor(b.kind);
                return (
                  <option key={b.badgeId} value={b.kind}>
                    ${m?.symbol ?? b.kind}
                  </option>
                );
              })}
            </select>
          </label>
          <span className="as">
            {remainingTitle < 0 || remainingBody < 0 ? (
              <span className="compose-status--over">over limit</span>
            ) : (
              "verified holder · wallet sealed"
            )}
          </span>
          <span className="cact">
            <button
              type="button"
              className="btn ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTitle("");
                setBody("");
                setErr(null);
              }}
            >
              cancel
            </button>
            <button type="button" className="btn solid" disabled={busy || !canSubmit} onClick={submit}>
              {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {stageCopy[stage]}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * The sealed-room gate — shown when the user can't post in the current room.
 * With a `kind` it's token-specific; without one it's the general "claim a
 * badge to post" gate (the all-rooms, no-badge state). Wired to the real claim
 * flow via `onUnseal`.
 */
function Gate({ kind, onUnseal }: { kind?: string; onUnseal: () => void }) {
  const meta = kind ? tokenFor(kind) : undefined;
  const symbol = meta?.symbol ?? kind;

  if (!kind) {
    return (
      <div className="gate">
        <div className="gate-coin">🔒</div>
        <div className="gate-lk">sealed forum</div>
        <h1>Claim a badge to post</h1>
        <p className="greq">
          BlindSol is for verified token holders. Pick a community whose token you actually hold —
          we check on-chain, then hand you an anonymous identity tied to the bag, never to your wallet.
        </p>
        <button className="btn solid" onClick={onUnseal}>
          Pick a badge &amp; claim
        </button>
      </div>
    );
  }

  return (
    <div className="gate">
      <div className="gate-coin gate-coin--bare">
        <TokenIcon kind={kind} size={64} />
      </div>
      <div className="gate-lk">🔒 sealed room</div>
      <h1>${symbol} holders only</h1>
      <p className="greq">
        This room is for verified <b>${symbol}</b> holders. To unseal it, claim a <b>${symbol}</b> badge —
        your seal proves the balance by signature, so your wallet and your identity stay private.
      </p>
      <button className="btn solid" onClick={onUnseal}>
        Verify holdings &amp; unseal
      </button>
    </div>
  );
}
