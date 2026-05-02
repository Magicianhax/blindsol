import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const { OnChainBadgeRegistry } = await import("../src/badges/onchain.js");

async function main(): Promise<void> {
  const programId = process.env.BADGE_PROGRAM_ID;
  if (!programId) throw new Error("BADGE_PROGRAM_ID is required");
  const keypairPath = process.env.BADGE_AUTHORITY_KEYPAIR ?? `${process.env.HOME ?? process.env.USERPROFILE}/.config/solana/id.json`;
  // Prefer BADGE_RPC_URL — the network where the badge program is deployed.
  const rpcUrl = process.env.BADGE_RPC_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

  const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8")) as number[];
  const authority = Keypair.fromSecretKey(Uint8Array.from(secret));

  const connection = new Connection(rpcUrl, "confirmed");
  const registry = new OnChainBadgeRegistry({
    connection,
    programId: new PublicKey(programId),
    authority,
  });

  console.log(`[init] program id: ${programId}`);
  console.log(`[init] authority:  ${authority.publicKey.toBase58()}`);
  console.log(`[init] rpc:        ${rpcUrl}`);

  if (await registry.isInitialized()) {
    const next = await registry.getNextIndex();
    console.log(`[init] registry already initialized. next_index=${next}`);
    return;
  }

  console.log("[init] sending initialize_registry...");
  const sig = await registry.initialize();
  console.log(`[init] confirmed: ${sig}`);
  console.log(`[init] explorer:  https://explorer.solana.com/tx/${sig}?cluster=devnet`);
}

main().catch((err) => {
  console.error("[init] failed:", err);
  process.exit(1);
});
