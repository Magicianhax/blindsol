import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../../.env") });

const { closeDb, getDb, schema } = await import("./index.js");

async function main(): Promise<void> {
  const db = getDb();

  // wipe in dependency order
  await db.delete(schema.reactions);
  await db.delete(schema.comments);
  await db.delete(schema.posts);
  await db.delete(schema.badges);

  await db.insert(schema.badges).values([
    { kind: "jup_holder", onChainPubkey: "BadgeJupHolderMint11111111111111111111111111" },
    { kind: "sol_foundation", onChainPubkey: "BadgeSolFoundationMint111111111111111111111" },
    { kind: "anthropic_eng", onChainPubkey: "BadgeAnthropicEngMint11111111111111111111111" },
  ]);

  const [first, second] = await db
    .insert(schema.posts)
    .values([
      {
        authorAnonId: "anon_seed_a",
        badgeKind: "jup_holder",
        content: "Hot take: $JUP burn is way more bullish than the market is pricing in.",
        contentHash: "deadbeef0001",
        perAttestation: "dev_seed_attestation_a",
        stakeLamports: 1_000_000n,
      },
      {
        authorAnonId: "anon_seed_b",
        badgeKind: "anthropic_eng",
        content: "Working on something internally that's going to surprise people. Stay tuned.",
        contentHash: "deadbeef0002",
        perAttestation: "dev_seed_attestation_b",
        stakeLamports: 1_000_000n,
      },
      {
        authorAnonId: "anon_seed_c",
        badgeKind: "sol_foundation",
        content: "Block production has been buttery this week. Firedancer testnet numbers are insane.",
        contentHash: "deadbeef0003",
        perAttestation: "dev_seed_attestation_c",
        stakeLamports: 1_000_000n,
      },
    ])
    .returning();

  if (first) {
    await db.insert(schema.comments).values([
      {
        postId: first.id,
        authorAnonId: "anon_seed_d",
        badgeKind: "jup_holder",
        content: "Disagree — emissions still outpace burn this quarter.",
        perAttestation: "dev_seed_attestation_d",
      },
    ]);

    await db.insert(schema.reactions).values([
      {
        postId: first.id,
        reactorAnonId: "anon_seed_d",
        kind: "up",
        perAttestation: "dev_seed_attestation_react_1",
      },
      {
        postId: first.id,
        reactorAnonId: "anon_seed_e",
        kind: "down",
        perAttestation: "dev_seed_attestation_react_2",
      },
    ]);
  }

  if (second) {
    await db.insert(schema.reactions).values([
      {
        postId: second.id,
        reactorAnonId: "anon_seed_f",
        kind: "up",
        perAttestation: "dev_seed_attestation_react_3",
      },
    ]);
  }

  console.log("[seed] inserted 3 badges, 3 posts, 1 comment, 3 reactions");
  await closeDb();
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
