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
          <h2 className="text-2xl font-semibold text-text">No active badge</h2>
          <p className="mt-1 text-sm text-muted">
            Claim a badge first; usernames are bound to a specific badge anon.
          </p>
          <div className="mt-3 flex justify-end">
            <button onClick={onClose} className="scribble-btn scribble-btn--ghost">
              Close
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
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-xl border border-line bg-bg shadow-md">
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h2 className="text-[18px] font-semibold text-text">
              Pick a handle
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              Replaces the{" "}
              <span className="font-numeric text-text-2">
                {active.anonId ? `${active.anonId.slice(0, 12)}…` : "anon hash"}
              </span>{" "}
              on your <span className="text-text">${symbol}</span> posts. Anyone can see it; nobody
              can link it back to your wallet — that mapping stays in MagicBlock&apos;s TEE.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition hover:bg-bg-3 hover:text-text"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
            <TokenIcon kind={active.kind} size={22} />
            <span className="text-[15px] font-semibold text-text">${symbol}</span>
            {active.anonId ? (
              <>
                <span className="text-muted-2">·</span>
                <span className="font-numeric text-[12px]">{active.anonId}</span>
              </>
            ) : null}
          </div>

          {current === undefined ? (
            // Still loading the existing-handle lookup. Don't show input or
            // "you have @x" yet — avoids flashing the picker for a user
            // who actually has a name set.
            <p className="text-sm text-muted">checking…</p>
          ) : current ? (
            // Already has a handle — schema enforces one per anon. Force
            // release-first instead of letting them type into a doomed input.
            <div className="rounded-lg border border-line bg-bg-3 px-4 py-4">
              <div className="text-[15px] font-semibold text-text">
                You already post as <span className="font-numeric">@{current}</span>
              </div>
              <p className="mt-1 text-sm text-muted">
                One handle per badge. Release this one before picking a different name — your
                existing posts will revert to displaying the anon hash.
              </p>
              <button
                onClick={release}
                disabled={busy}
                className="scribble-btn scribble-btn--red mt-3"
              >
                {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-danger/40 border-t-danger" />}
                {busy ? "Releasing…" : `Release @${current}`}
              </button>
            </div>
          ) : (
            <>
              <label className="block text-sm text-muted" htmlFor="handle-input">
                New handle
              </label>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-numeric text-2xl text-muted-2">@</span>
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
            </>
          )}

          {err && (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-1.5 text-sm text-danger">
              {err}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button onClick={onClose} className="scribble-btn scribble-btn--ghost">
              {current ? "Close" : "Nevermind"}
            </button>
            {/* Hide claim button when the user already has a handle —
                schema enforces one-per-anon, so the button can't succeed
                until they release. */}
            {current ? null : (
              <button
                onClick={claim}
                disabled={busy || avail.kind !== "available"}
                className="scribble-btn scribble-btn--primary"
              >
                {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-bg/40 border-t-bg" />}
                {busy ? "Claiming…" : "Claim handle"}
              </button>
            )}
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
      <p className="mt-1 text-xs text-acid">
        ✓ <span className="font-numeric">@{state.normalized}</span> is available
      </p>
    );
  }
  if (state.kind === "taken") {
    return <p className="mt-1 text-xs text-danger">✗ taken</p>;
  }
  return <p className="mt-1 text-xs text-danger">✗ {state.reason}</p>;
}

function Backdrop({ children }: { children: React.ReactNode }) {
  // Solid dark scrim regardless of theme — `--ink` flips between light and
  // dark, which made `bg-ink/40` near-invisible in dark mode and let the
  // page content bleed through.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
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
