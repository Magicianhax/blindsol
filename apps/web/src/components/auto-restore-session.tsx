"use client";

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignMessage, useWallets } from "@privy-io/react-auth/solana";
import bs58 from "bs58";
import { api } from "@/lib/api";
import { useBadge } from "./badge-context";

/**
 * Background effect that recovers badges on a fresh device or after a
 * localStorage wipe. Runs whenever:
 *   - Privy reports an authenticated wallet
 *   - The local purse is empty (so we don't disturb users who already
 *     have their badges cached locally)
 *   - We haven't already attempted restore in this tab session (a
 *     `triedRef` guards against re-firing on every re-render)
 *
 * The restore handshake:
 *   1. GET /auth/challenge → server-issued nonce + canonical message
 *   2. Wallet signs the message via Privy's `signMessage`
 *   3. POST /auth/sign-in → server verifies + returns every badge this
 *      wallet has on record, with fresh bearer tokens
 *   4. Insert each into the purse via `addBadge` (which persists to
 *      localStorage). Active badge defaults to whichever was added first.
 *
 * Privacy note: the wallet pubkey is sent over the wire to /auth/sign-in
 * — it has to, the server needs it to derive the deterministic anon_ids
 * and verify the signature — but it's never persisted there. The HMAC
 * happens in-memory and the wallet bytes are dropped before the response
 * is sent.
 */
export function AutoRestoreSession() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { badges, addBadge } = useBadge();

  const triedRef = useRef(false);
  // Track which wallet we last restored against. If the user disconnects
  // and connects a different wallet, we want to attempt restore again.
  const lastWalletRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !authenticated) return;
    const wallet = wallets[0];
    if (!wallet) return;

    // Already have badges cached → nothing to restore. The user can still
    // claim more via the explicit claim flow.
    if (badges.length > 0) {
      lastWalletRef.current = wallet.address;
      return;
    }

    // Same wallet as the last attempt? Don't retry — likely the wallet
    // has no on-record badges, and re-prompting the user to sign on
    // every re-render would be hostile.
    if (lastWalletRef.current === wallet.address && triedRef.current) return;

    // New wallet (or first run) — attempt restore.
    triedRef.current = true;
    lastWalletRef.current = wallet.address;

    let cancelled = false;
    (async () => {
      try {
        const { nonce, message } = await api.signInChallenge();
        const { signature } = await signMessage({
          message: new TextEncoder().encode(message),
          wallet,
        });
        const { badges: restored } = await api.signIn({
          wallet: wallet.address,
          signature: bs58.encode(signature),
          nonce,
        });
        if (cancelled) return;
        for (const b of restored) {
          addBadge({
            badgeId: b.badgeId,
            kind: b.kind,
            label: b.label,
            badgeToken: b.badgeToken,
            expiresAt: b.expiresAt,
            anonId: b.anonId,
          });
        }
      } catch {
        // Silent — restore is best-effort. If the wallet has no badges,
        // or the user rejected the signature, leave them in the empty
        // state and let them claim explicitly.
      }
    })();

    return () => {
      cancelled = true;
    };
    // We deliberately exclude `addBadge` from deps — it's stable in the
    // current BadgeProvider implementation but listing it would re-run
    // the effect every time the purse mutates, which fights the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, wallets, badges.length, signMessage]);

  return null;
}
