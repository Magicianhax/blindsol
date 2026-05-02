import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { MagicBlockClient } from "@blindsol/magicblock-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const { MagicBlockStakeService } = await import("../src/magicblock/stake-service.js");

async function main(): Promise<void> {
  const houseSecret = process.env.HOUSE_WALLET_SECRET;
  const stakePool = process.env.STAKE_POOL_PUBKEY;
  if (!houseSecret) throw new Error("HOUSE_WALLET_SECRET missing");
  if (!stakePool) throw new Error("STAKE_POOL_PUBKEY missing");

  const houseKeypair = Keypair.fromSecretKey(bs58.decode(houseSecret));
  const usdcMint = new PublicKey(
    process.env.USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  );
  const cluster = process.env.MAGICBLOCK_CLUSTER ?? "mainnet";
  const apiBase = process.env.MAGICBLOCK_API_BASE ?? "https://payments.magicblock.app";
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

  console.log("[smoke] cluster   =", cluster);
  console.log("[smoke] apiBase   =", apiBase);
  console.log("[smoke] solanaRpc =", rpcUrl);
  console.log("[smoke] house pub =", houseKeypair.publicKey.toBase58());
  console.log("[smoke] stakePool =", stakePool);
  console.log("[smoke] mint      =", usdcMint.toBase58());

  const client = new MagicBlockClient({ apiBase, cluster });
  const connection = new Connection(rpcUrl, "confirmed");

  const service = new MagicBlockStakeService({
    client,
    connection,
    houseKeypair,
    stakePoolPubkey: new PublicKey(stakePool),
    mint: usdcMint,
    perPostAmountRaw: BigInt(process.env.STAKE_PER_POST_RAW ?? "100000"),
    cluster,
    memo: "blindsol-stake-smoke",
  });

  console.log("[smoke] initialize → balance lookup...");
  await service.initialize();

  console.log("[smoke] lockStake → real private USDC transfer...");
  const receipt = await service.lockStake();
  console.log("[smoke] OK");
  console.log("  signature:", receipt.signature);
  console.log("  amount   :", receipt.amountRaw, "raw");
  console.log("  recipient:", receipt.recipient);
  console.log("  explorer :", `https://explorer.solana.com/tx/${receipt.signature}`);
}

main().catch((err) => {
  console.error("[smoke] failed:", err);
  process.exit(1);
});
