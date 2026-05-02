import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const { OnChainBadgeRegistry } = await import("../src/badges/onchain.js");

const programId = new PublicKey(process.env.BADGE_PROGRAM_ID!);
const rpcUrl = process.env.BADGE_RPC_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const keypairPath = process.env.BADGE_AUTHORITY_KEYPAIR!;
const secret = JSON.parse(fs.readFileSync(keypairPath, "utf8")) as number[];
const authority = Keypair.fromSecretKey(Uint8Array.from(secret));

const conn = new Connection(rpcUrl, "confirmed");
const registry = new OnChainBadgeRegistry({ connection: conn, programId, authority });

const [pda] = registry.registryPda();
console.log("BADGE_PROGRAM_ID:        ", programId.toBase58());
console.log("BADGE_RPC_URL:           ", process.env.BADGE_RPC_URL ?? "(unset)");
console.log("SOLANA_RPC_URL:          ", process.env.SOLANA_RPC_URL ?? "(unset)");
console.log("Resolved rpcUrl:         ", rpcUrl);
console.log("Authority pubkey:        ", authority.publicKey.toBase58());
console.log("Registry PDA (computed): ", pda.toBase58());

const info = await conn.getAccountInfo(pda);
console.log("getAccountInfo returned: ", info ? `EXISTS (lamports=${info.lamports}, data=${info.data.length}B)` : "null");

if (info) {
  const next = await registry.getNextIndex();
  console.log("Registry nextIndex:      ", next.toString());
}
