"use client";

import bs58 from "bs58";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { api, BADGE_LABELS } from "@/lib/api";
import { useBadge } from "./badge-context";

const KINDS: Array<{ kind: string; label: string }> = Object.entries(BADGE_LABELS).map(([kind, label]) => ({
  kind,
  label,
}));

export function ClaimDialog({ onClose }: { onClose: () => void }) {
  const { publicKey, signMessage } = useWallet();
  const { setBadge } = useBadge();
  const [kind, setKind] = useState(KINDS[0]!.kind);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function claim() {
    if (!publicKey) {
      setErr("connect your wallet first");
      return;
    }
    if (!signMessage) {
      setErr("your wallet does not support message signing");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const wallet = publicKey.toBase58();
      const { challenge } = await api.getChallenge(wallet);
      const sig = await signMessage(new TextEncoder().encode(challenge));
      const result = await api.claim({
        wallet,
        kind,
        challenge,
        signature: bs58.encode(sig),
      });
      setBadge({
        badgeId: result.badgeId,
        kind: result.kind,
        label: result.label,
        badgeToken: result.badgeToken,
        expiresAt: result.expiresAt,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-panel p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Claim a badge</h2>
          <button onClick={onClose} className="text-muted hover:text-white text-sm">
            ✕
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">
          Pick what you want to be verified as. We&apos;ll have your wallet sign a one-time
          challenge so we know it&apos;s really you. Your wallet → posts link is then sealed
          inside the PER and never stored in our DB.
        </p>

        <div className="mt-4 space-y-2">
          {KINDS.map((k) => (
            <label
              key={k.kind}
              className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 transition ${
                kind === k.kind ? "border-accent" : "border-border hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k.kind}
                checked={kind === k.kind}
                onChange={() => setKind(k.kind)}
                className="accent-accent"
              />
              <span className="font-mono text-sm">{k.label}</span>
            </label>
          ))}
        </div>

        {err && <div className="mt-4 rounded border border-red-700 bg-red-950/40 p-2 text-sm text-red-300">{err}</div>}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-white">
            Cancel
          </button>
          <button
            onClick={claim}
            disabled={busy || !publicKey}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-black hover:bg-accent/80 disabled:bg-border disabled:text-muted"
          >
            {busy ? "Claiming…" : publicKey ? "Sign & claim" : "Connect wallet first"}
          </button>
        </div>
      </div>
    </div>
  );
}
