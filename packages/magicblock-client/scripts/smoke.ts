/**
 * Smoke test against the live MagicBlock Private Payments API.
 *
 * Usage:
 *   AGENT_WALLET_SECRET=<base58> pnpm --filter @blindsol/magicblock-client smoke
 *
 * If AGENT_WALLET_SECRET is not set, generates a throwaway keypair and runs
 * only the auth flow (the wallet will have no balance to query).
 */
import { MagicBlockClient } from "../src/client.js";
import { KeypairSigner } from "../src/signers/keypair.js";

const API_BASE = process.env.MAGICBLOCK_API_BASE ?? "https://payments.magicblock.app";
const USDC_MINT = process.env.USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function main(): Promise<void> {
  const secret = process.env.AGENT_WALLET_SECRET;
  const signer = secret ? KeypairSigner.fromSecretBase58(secret) : KeypairSigner.generate();

  const pubkey = await signer.publicKey();
  console.log(`[smoke] using wallet ${pubkey}${secret ? "" : " (ephemeral)"}`);

  const client = new MagicBlockClient({ apiBase: API_BASE, signer });

  console.log("[smoke] challenge → sign → login...");
  const session = await client.login();
  console.log(`[smoke] ok — bearer token length=${session.bearerToken.length}`);

  console.log(`[smoke] querying base-chain balance of ${USDC_MINT}...`);
  try {
    const bal = await client.balance(USDC_MINT);
    console.log(`[smoke] balance: ${bal.amount} (decimals=${bal.decimals})`);
  } catch (err) {
    console.warn(`[smoke] balance query failed: ${(err as Error).message}`);
  }

  console.log(`[smoke] querying private-balance...`);
  try {
    const pbal = await client.privateBalance(USDC_MINT);
    console.log(`[smoke] private-balance: ${pbal.amount} (decimals=${pbal.decimals})`);
  } catch (err) {
    console.warn(`[smoke] private-balance query failed: ${(err as Error).message}`);
  }
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  process.exit(1);
});
