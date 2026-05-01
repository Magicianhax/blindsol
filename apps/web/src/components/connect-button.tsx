"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";

export function ConnectButton() {
  const { publicKey, connected, connecting, connect, disconnect, select, wallet, wallets } = useWallet();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    setBusy(true);
    try {
      if (connected) {
        await disconnect();
        return;
      }
      // Default to Phantom if it's available.
      if (!wallet) {
        const phantom = wallets.find((w) => w.adapter.name === "Phantom");
        if (phantom) select(phantom.adapter.name);
      }
      await connect();
    } catch (err) {
      console.error("[wallet] connect error:", err);
    } finally {
      setBusy(false);
    }
  }, [connect, connected, disconnect, select, wallet, wallets]);

  const label = busy || connecting
    ? "Connecting…"
    : connected && publicKey
      ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
      : "Connect wallet";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || connecting}
      className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm font-mono hover:border-accent hover:text-accent transition"
    >
      {label}
    </button>
  );
}
