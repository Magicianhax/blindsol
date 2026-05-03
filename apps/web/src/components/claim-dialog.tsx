"use client";

import bs58 from "bs58";
import { usePrivy } from "@privy-io/react-auth";
import { useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import { useState } from "react";
import { api } from "@/lib/api";
import { useBadge } from "./badge-context";
import { TokenIcon } from "./token-icon";
import { KINDS_BY_CATEGORY, tokenFor, type TokenMeta } from "@/lib/tokens";

const CATEGORIES: Array<{ label: TokenMeta["category"]; description: string; emoji: string }> = [
  { label: "DeFi", description: "perps, lending, stuff", emoji: "🏦" },
  { label: "Memes", description: "for the degens", emoji: "🐸" },
  { label: "Infra", description: "oracle dorks, depin miners", emoji: "🛠" },
];

export function ClaimDialog({
  onClose,
  preselectKind,
}: {
  onClose: () => void;
  preselectKind?: string;
}) {
  const { authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const wallet = wallets[0];
  const { addBadge, badges } = useBadge();
  const ownedKinds = new Set(badges.map((b) => b.kind));
  const firstUnclaimed = Object.keys(KINDS_BY_CATEGORY)
    .flatMap((cat) => KINDS_BY_CATEGORY[cat as TokenMeta["category"]])
    .find((k) => !ownedKinds.has(k));
  const initialKind =
    preselectKind && !ownedKinds.has(preselectKind) ? preselectKind : firstUnclaimed ?? "jup_holder";
  const [kind, setKind] = useState<string | null>(initialKind);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function claim() {
    if (!kind) {
      setErr("pick a community first");
      return;
    }
    if (!authenticated || !wallet) {
      setErr("connect your wallet first");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const walletAddress = wallet.address;
      const { challenge } = await api.getChallenge(walletAddress);
      const { signature } = await signMessage({
        message: new TextEncoder().encode(challenge),
        wallet,
      });
      const result = await api.claim({
        wallet: walletAddress,
        kind,
        challenge,
        signature: bs58.encode(signature),
      });
      addBadge({
        badgeId: result.badgeId,
        kind: result.kind,
        label: result.label,
        badgeToken: result.badgeToken,
        expiresAt: result.expiresAt,
        anonId: result.anonId,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <div className="scribble-card wobble-in relative w-full max-w-2xl">
        <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-border-soft p-5">
          <div>
            <h2 className="font-display text-3xl leading-tight text-ink">
              <span className="scribble-underline">claim a badge</span>
            </h2>
            <p className="mt-1 text-[15px] leading-snug text-text-2">
              we&apos;ll check the chain and prove you actually hold the bag, then hand you an
              anonymous identity. wallet ↔ identity link stays sealed in MagicBlock&apos;s rollup.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg border-2 border-ink p-1.5 transition hover:bg-crayon-yellow"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-5">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-5 last:mb-0">
              <div className="mb-2 flex items-baseline gap-3">
                <h3 className="font-display text-xl text-ink">
                  {cat.emoji} {cat.label}
                </h3>
                <span className="text-sm text-muted">— {cat.description}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {KINDS_BY_CATEGORY[cat.label].map((k) => {
                  const isActive = kind === k;
                  const owned = ownedKinds.has(k);
                  const meta = tokenFor(k)!;
                  return (
                    <button
                      key={k}
                      onClick={() => setKind(k)}
                      disabled={owned}
                      className={`flex items-center gap-2 rounded-lg border-2 p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        owned
                          ? "border-dashed border-border-soft bg-surface-2/40"
                          : isActive
                          ? "border-ink bg-crayon-yellow shadow-pen-sm"
                          : "border-dashed border-border-soft hover:border-ink hover:bg-surface-2"
                      }`}
                      title={owned ? "already in your badge purse" : undefined}
                    >
                      <TokenIcon kind={k} size={32} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-display text-lg leading-none text-ink">${meta.symbol}</span>
                        <span className="truncate text-[11px] text-muted">
                          {owned ? "already claimed" : "verified holder"}
                        </span>
                      </div>
                      {owned ? <CheckIcon /> : isActive && <CheckIcon />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {err && (
          <div className="mx-5 mb-3 rounded-lg border-2 border-crayon-red bg-crayon-red/10 px-3 py-2 text-sm text-crayon-red">
            oops — {err}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-border-soft p-5">
          <span className="font-mono text-xs text-muted">
            {wallet
              ? `${wallet.address.slice(0, 4)}…${wallet.address.slice(-4)}`
              : "wallet not connected"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="scribble-btn scribble-btn--ghost">
              nevermind
            </button>
            {!authenticated || !wallet ? (
              <button onClick={login} className="scribble-btn scribble-btn--primary">
                connect first
              </button>
            ) : (
              <button
                onClick={claim}
                disabled={busy || !kind}
                className="scribble-btn scribble-btn--primary"
              >
                {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {busy ? "claiming…" : "sign & claim"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="ml-auto h-4 w-4 text-ink" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}
