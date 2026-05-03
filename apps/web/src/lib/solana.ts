import { Connection } from "@solana/web3.js";

/**
 * Single shared mainnet connection for the browser. Privy doesn't expose
 * a `useConnection()` hook — apps build their own — so we keep one
 * module-scoped instance instead of recreating on every render.
 */
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

let _conn: Connection | null = null;

export function getConnection(): Connection {
  if (!_conn) {
    _conn = new Connection(RPC, { commitment: "confirmed" });
  }
  return _conn;
}
