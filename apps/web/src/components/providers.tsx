"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { BadgeProvider } from "./badge-context";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export function Providers({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <h1 className="font-display text-3xl text-crayon-red">missing privy app id</h1>
        <p className="mt-2 text-base text-text-2">
          Set <code className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</code> in your{" "}
          <code className="font-mono">.env.local</code> (grab it from{" "}
          <a
            href="https://dashboard.privy.io"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink"
          >
            dashboard.privy.io
          </a>
          ) and reload.
        </p>
      </div>
    );
  }

  // Privy resolves Solana RPC URLs from its dashboard config; we don't need
  // to pass clusters here. RPC_ENDPOINT is still used by the standalone
  // Connection in lib/solana.ts for tx broadcast / confirm.
  void RPC_ENDPOINT;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Wallet-only — no email, Google, SMS, etc. Keeps the privacy
        // story clean: the only identity Privy ever sees is the EOA's
        // public key, which is also what the API verifies against.
        loginMethods: ["wallet"],
        appearance: {
          // Cream-paper background to match the scribble theme; Privy
          // derives foreground colors from this hex automatically.
          theme: "#fffaee",
          // Crayon-yellow accent (matches the "Claim a badge" pill).
          accentColor: "#facc15",
          logo: "/blindSOL.png",
          walletChainType: "solana-only",
          showWalletLoginFirst: true,
          // Header copy + subtitle in BlindSol's voice.
          landingHeader: "verified bags. anonymous voices.",
          loginMessage: "connect a Solana wallet to claim your badge.",
          // Pin the three Solana wallets we explicitly want surfaced first.
          // `detected_solana_wallets` falls back to any other wallet the
          // user has installed; `wallet_connect` covers mobile via QR.
          walletList: [
            "phantom",
            "solflare",
            "backpack",
            "jupiter",
            "detected_solana_wallets",
            "wallet_connect",
          ],
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
        // No embedded wallets — those are for social-login users we're
        // not supporting. Users bring their own Phantom/Backpack/Solflare.
        embeddedWallets: {
          solana: { createOnLogin: "off" },
        },
      }}
    >
      <BadgeProvider>{children}</BadgeProvider>
    </PrivyProvider>
  );
}
