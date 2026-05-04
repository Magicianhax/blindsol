import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { OnChainBadgeRegistry, ownerCommitmentFromSeed } from "../src/badges/onchain.js";
import { newAnonSeed } from "../src/per/token.js";

/**
 * End-to-end smoke test for the new delegate_badge instruction. Mints a
 * fresh test badge, then delegates it to MagicBlock's PER. Logs each
 * tx signature so you can inspect on Solana Explorer.
 *
 * Run: pnpm exec tsx scripts/test-delegate.ts
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const programId = new PublicKey(process.env.BADGE_PROGRAM_ID!);
const rpcUrl = process.env.BADGE_RPC_URL!;
const keypairPath = process.env.BADGE_AUTHORITY_KEYPAIR!;
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(readFileSync(keypairPath, "utf8")) as number[]),
);
const connection = new Connection(rpcUrl, "confirmed");

const registry = new OnChainBadgeRegistry({ connection, programId, authority });

// Use a kind unlikely to collide with prod data so the test is repeatable.
const TEST_KIND = "test_holder_per";

console.log(`[test] program:   ${programId.toBase58()}`);
console.log(`[test] authority: ${authority.publicKey.toBase58()}`);
console.log(`[test] rpc:       ${rpcUrl}`);

console.log(`[test] minting test badge...`);
const seed = newAnonSeed();
const minted = await registry.mintBadge({
  kind: TEST_KIND,
  ownerCommitment: ownerCommitmentFromSeed(seed),
});
console.log(
  `[test] minted ok: badge=${minted.badgePubkey} index=${minted.index} sig=${minted.signature}`,
);
console.log(`[test]   https://explorer.solana.com/tx/${minted.signature}?cluster=devnet`);

console.log(`[test] delegating badge to PER...`);
const delegated = await registry.delegateBadge({
  kind: TEST_KIND,
  badgeIndex: minted.index,
});
console.log(`[test] delegated ok: sig=${delegated.signature}`);
console.log(`[test]   https://explorer.solana.com/tx/${delegated.signature}?cluster=devnet`);

console.log(`\n[test] done. badge ${minted.badgePubkey} is now delegated to MagicBlock PER.`);
