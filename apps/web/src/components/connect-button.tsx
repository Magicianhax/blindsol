"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth/solana";

/**
 * Replaces the Solana wallet-adapter "Connect" button. Privy handles the
 * picker UX (email / Google / external wallet) on click.
 */
export function ConnectButton() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];

  if (!ready) {
    return (
      <button disabled className="scribble-btn opacity-60">
        <span className="font-mono text-sm">…</span>
      </button>
    );
  }

  if (!authenticated || !wallet) {
    return (
      <button onClick={login} className="scribble-btn scribble-btn--primary">
        Connect
      </button>
    );
  }

  const addr = wallet.address;
  const short = `${addr.slice(0, 4)}…${addr.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={logout}
      className="scribble-btn"
      title="Click to disconnect"
    >
      <span className="h-2 w-2 rounded-full bg-crayon-green" />
      <span className="font-mono text-sm">{short}</span>
    </button>
  );
}
