"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useBadge } from "./badge-context";
import { TokenIcon } from "./token-icon";
import { tokenFor } from "@/lib/tokens";

type AvailState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; normalized: string }
  | { kind: "taken" }
  | { kind: "invalid"; reason: string };

const PATTERN_HINT = "3-20 chars, lowercase letters/digits/underscore, can't start with _";

export function UsernameDialog({ onClose }: { onClose: () => void }) {
  const { active } = useBadge();
  const [input, setInput] = useState("");
  const [avail, setAvail] = useState<AvailState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null | undefined>(undefined);

  // Pull the active badge's current username so we can show "you currently
  // post as @foo" rather than re-prompting for an empty pick.
  useEffect(() => {
    let cancelled = false;
    if (!active) {
      setCurrent(null);
      return;
    }
    api.myUsername(active.badgeToken)
      .then((r) => {
        if (!cancelled) setCurrent(r.username);
      })
      .catch(() => {
        if (!cancelled) setCurrent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  // Debounced availability check.
  useEffect(() => {
    const trimmed = input.trim();
    if (!trimmed) {
      setAvail({ kind: "idle" });
      return;
    }
    setAvail({ kind: "checking" });
    const handle = setTimeout(async () => {
      try {
        const r = await api.checkUsername(trimmed);
        if (!r.available) {
          setAvail(r.reason ? { kind: "invalid", reason: r.reason } : { kind: "taken" });
          return;
        }
        setAvail({ kind: "available", normalized: r.normalized ?? trimmed });
      } catch {
        setAvail({ kind: "invalid", reason: "lookup failed" });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [input]);

  if (!active) {
    return (
      <Backdrop>
        <div className="scribble-card wobble-in w-full max-w-md p-5">
          <h2 className="font-display text-2xl text-ink">no active badge</h2>
          <p className="mt-1 text-sm text-text-2">
            Claim a badge first; usernames are bound to a specific badge anon.
          </p>
          <div className="mt-3 flex justify-end">
            <button onClick={onClose} className="scribble-btn scribble-btn--ghost">
              close
            </button>
          </div>
        </div>
      </Backdrop>
    );
  }

  const meta = tokenFor(active.kind);
  const symbol = meta?.symbol ?? active.kind;

  async function claim() {
    if (avail.kind !== "available" || !active) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.claimUsername(active.badgeToken, avail.normalized);
      setCurrent(r.username);
      setInput("");
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErr("that name was just taken — try another");
        setAvail({ kind: "taken" });
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    if (!active || !current) return;
    setBusy(true);
    setErr(null);
    try {
      await api.releaseUsername(active.badgeToken);
      setCurrent(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop>
      <div className="scribble-card wobble-in w-full max-w-lg">
        <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-border-soft p-5">
          <div>
            <h2 className="font-display text-2xl text-ink">
              <span className="scribble-underline">pick a handle</span>
            </h2>
            <p className="mt-1 text-sm leading-snug text-text-2">
              Replaces the{" "}
              <span className="font-mono">
                {active.anonId ? `${active.anonId.slice(0, 12)}…` : "anon hash"}
              </span>{" "}
              on your <span className="font-mono">${symbol}</span> posts. Anyone can see it; nobody
              can link it back to your wallet — that mapping stays in MagicBlock&apos;s TEE.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="close"
            className="rounded-lg border-2 border-ink p-1.5 transition hover:bg-crayon-yellow"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
            <TokenIcon kind={active.kind} size={22} />
            <span className="font-display text-base text-ink">${symbol}</span>
            {active.anonId ? (
              <>
                <span className="text-muted-2">·</span>
                <span className="font-mono text-[12px]">{active.anonId}</span>
              </>
            ) : null}
          </div>

          {current ? (
            <div className="mb-4 rounded-lg border-2 border-ink bg-crayon-yellow/30 px-3 py-2">
              <div className="font-display text-base text-ink">currently @{current}</div>
              <button
                onClick={release}
                disabled={busy}
                className="mt-1 text-xs text-crayon-red underline disabled:opacity-50"
              >
                release this name
              </button>
            </div>
          ) : null}

          <label className="block text-sm text-text-2" htmlFor="handle-input">
            new handle
          </label>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-2xl text-muted">@</span>
            <input
              id="handle-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="whaleboy420"
              autoComplete="off"
              maxLength={20}
              disabled={busy}
              className="scribble-input flex-1"
            />
          </div>
          <AvailabilityHint state={avail} />

          {err && (
            <div className="mt-3 rounded-lg border-2 border-crayon-red bg-crayon-red/10 px-3 py-1.5 text-sm text-crayon-red">
              {err}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="scribble-btn scribble-btn--ghost">
              nevermind
            </button>
            <button
              onClick={claim}
              disabled={busy || avail.kind !== "available"}
              className="scribble-btn scribble-btn--primary"
            >
              {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {busy ? "claiming…" : "claim handle"}
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}

function AvailabilityHint({ state }: { state: AvailState }) {
  if (state.kind === "idle") {
    return <p className="mt-1 text-xs text-muted">{PATTERN_HINT}</p>;
  }
  if (state.kind === "checking") {
    return <p className="mt-1 text-xs text-muted">checking…</p>;
  }
  if (state.kind === "available") {
    return (
      <p className="mt-1 text-xs text-crayon-green">
        ✓ <span className="font-mono">@{state.normalized}</span> is available
      </p>
    );
  }
  if (state.kind === "taken") {
    return <p className="mt-1 text-xs text-crayon-red">✗ taken</p>;
  }
  return <p className="mt-1 text-xs text-crayon-red">✗ {state.reason}</p>;
}

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      {children}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
    </svg>
  );
}
