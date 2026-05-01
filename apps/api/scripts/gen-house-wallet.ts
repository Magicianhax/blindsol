import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Generate fresh wallets for MagicBlock Private Payments stake escrow.
 *
 * - HOUSE_WALLET: signs MagicBlock login + transfer txs. Needs SOL + USDC.
 * - STAKE_POOL: receive-only address for staked posts. No secret needed by us.
 */
function main(): void {
  const house = Keypair.generate();
  const stakePool = Keypair.generate();

  const houseSecret = bs58.encode(house.secretKey);
  const housePub = house.publicKey.toBase58();
  const stakePoolPub = stakePool.publicKey.toBase58();
  const stakePoolSecret = bs58.encode(stakePool.secretKey);

  console.log("─".repeat(70));
  console.log("  BlindSol MagicBlock wallets — generated fresh");
  console.log("─".repeat(70));
  console.log("");
  console.log("  HOUSE wallet (signs MagicBlock txs — FUND THIS ONE):");
  console.log(`    pubkey: ${housePub}`);
  console.log("");
  console.log("  STAKE POOL (receive-only — no funding required):");
  console.log(`    pubkey: ${stakePoolPub}`);
  console.log("");
  console.log("─".repeat(70));
  console.log("  Add to .env:");
  console.log("─".repeat(70));
  console.log(`HOUSE_WALLET_SECRET=${houseSecret}`);
  console.log(`HOUSE_WALLET_PUBKEY=${housePub}`);
  console.log(`STAKE_POOL_PUBKEY=${stakePoolPub}`);
  console.log(`# (keep around in case you ever need to refund — not used at runtime)`);
  console.log(`STAKE_POOL_SECRET=${stakePoolSecret}`);
  console.log(`MAGICBLOCK_ENABLED=true`);
  console.log("─".repeat(70));
  console.log("");
  console.log("  Funding plan (mainnet beta):");
  console.log(`    1. Send ~0.05 SOL to ${housePub} (tx fees)`);
  console.log(`    2. Send ~5 USDC to ${housePub} (stake escrow budget — 50 posts at 0.1 USDC)`);
  console.log("    3. Restart the API");
  console.log("");
  console.log("  USDC mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  console.log("─".repeat(70));
}

main();
