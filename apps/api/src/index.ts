import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const fsMod = await import("node:fs");
const { Connection, Keypair, PublicKey } = await import("@solana/web3.js");
const { MagicBlockClient } = await import("@blindsol/magicblock-client");
const { createApp } = await import("./app.js");
const { getDb } = await import("./db/index.js");
const { getPerKeys } = await import("./per/keys.js");
const { SolanaEvidenceVerifier } = await import("./per/evidence.js");
const { BadgeIssuer } = await import("./per/issuer.js");
const { StakeBondPipeline } = await import("./posts/stake-bond.js");
const { OnChainBadgeRegistry, ownerCommitmentFromSeed } = await import("./badges/onchain.js");
const { newAnonSeed } = await import("./per/token.js");

const port = Number(process.env.API_PORT ?? 3001);
const db = getDb();

// Production: PER signing key is REQUIRED (no autogen). Outstanding badge
// tokens stay valid across restarts because the same key is reused.
const perKeys = getPerKeys();
if (!perKeys.secretKey) {
  throw new Error(
    "PER signing key required: set PER_DEV_SECRET (base58 ed25519 secret) in .env",
  );
}

// Two networks in play:
//   - mainnetConnection: MagicBlock private USDC transfers, JUP holdings check
//   - badgeConnection:   network where the Anchor badge_registry is deployed
const mainnetRpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const badgeRpc = process.env.BADGE_RPC_URL ?? mainnetRpc;
const mainnetConnection = new Connection(mainnetRpc, "confirmed");
const badgeConnection = new Connection(badgeRpc, "confirmed");

const evidence = new SolanaEvidenceVerifier(mainnetConnection);
const onChainRegistry = initOnChainRegistry();

const badgeIssuer = new BadgeIssuer({
  db,
  evidence,
  perSecretKey: perKeys.secretKey,
  perPubkeyBase58: perKeys.publicKeyBase58,
  ...(onChainRegistry
    ? {
        mintBadgeOnChain: async ({ kind }: { kind: string; walletBase58: string }) => {
          const seed = newAnonSeed();
          const r = await onChainRegistry.mintBadge({
            kind,
            ownerCommitment: ownerCommitmentFromSeed(seed),
          });
          return r.badgePubkey;
        },
      }
    : {}),
});

const stakeBond = initStakeBondPipeline();

const app = createApp({
  db,
  badgeIssuer,
  perPubkeyBase58: perKeys.publicKeyBase58,
  perSecretKey: perKeys.secretKey,
  ...(stakeBond ? { stakeBond } : {}),
  rpcUrls: { mainnet: mainnetRpc, badge: badgeRpc },
});

app.listen(port, () => {
  console.log(`[api] BlindSol API listening on :${port}`);
  console.log(`[api] mainnet RPC:             ${mainnetRpc}`);
  console.log(`[api] badge program RPC:       ${badgeRpc}`);
  console.log(`[api] PER attestation pubkey:  ${perKeys.publicKeyBase58}`);
  console.log(`[api] Stake-bond pipeline:     ${stakeBond ? "ENABLED (user pays)" : "disabled"}`);
  console.log(`[api] On-chain badge minting:  ${onChainRegistry ? "ENABLED" : "stubbed"}`);
});

function initOnChainRegistry() {
  const programId = process.env.BADGE_PROGRAM_ID;
  if (!programId) return undefined;

  const keypairPath = process.env.BADGE_AUTHORITY_KEYPAIR;
  if (!keypairPath) {
    console.warn("[api] BADGE_PROGRAM_ID set but BADGE_AUTHORITY_KEYPAIR missing — on-chain mint disabled");
    return undefined;
  }

  try {
    const secret = JSON.parse(fsMod.readFileSync(keypairPath, "utf8")) as number[];
    const authority = Keypair.fromSecretKey(Uint8Array.from(secret));
    return new OnChainBadgeRegistry({
      connection: badgeConnection,
      programId: new PublicKey(programId),
      authority,
    });
  } catch (err) {
    console.warn(`[api] failed to load BADGE_AUTHORITY_KEYPAIR (${keypairPath}): ${(err as Error).message}`);
    return undefined;
  }
}

function initStakeBondPipeline() {
  const stakePool = process.env.STAKE_POOL_PUBKEY;
  if (!stakePool) {
    console.warn("[api] STAKE_POOL_PUBKEY missing — stake-bond pipeline disabled");
    return undefined;
  }

  const cluster = process.env.MAGICBLOCK_CLUSTER ?? "mainnet";
  const client = new MagicBlockClient({
    apiBase: process.env.MAGICBLOCK_API_BASE ?? "https://payments.magicblock.app",
    cluster,
  });

  const usdcMint = new PublicKey(
    process.env.USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  );
  const minAmountRaw = BigInt(process.env.STAKE_PER_POST_RAW ?? "100000");

  return new StakeBondPipeline({
    client,
    connection: mainnetConnection,
    stakePool: new PublicKey(stakePool),
    mint: usdcMint,
    minAmountRaw,
    cluster,
  });
}
