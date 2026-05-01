import type { Keypair } from "@solana/web3.js";

export interface MagicBlockClientConfig {
  apiBase: string;
  keypair: Keypair;
  fetchImpl?: typeof fetch;
}

export interface AuthSession {
  pubkey: string;
  bearerToken: string;
  expiresAt: number;
}

export interface BalanceResult {
  mint: string;
  amount: string;
  decimals: number;
}
