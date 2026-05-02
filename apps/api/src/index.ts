import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const fsMod = await import("node:fs");
const { Connection, Keypair, PublicKey } = await import("@solana/web3.js");
const bs58Mod = await import("bs58");
const bs58 = bs58Mod.default;
const { MagicBlockClient } = await import("@blindsol/magicblock-client");
const { createApp } = await import("./app.js");
const { getDb } = await import("./db/index.js");
const { getPerKeys } = await import("./per/keys.js");
const { SolanaEvidenceVerifier } = await import("./per/evidence.js");
const { BadgeIssuer } = await import("./per/issuer.js");
const { MagicBlockStakeService } = await import("./magicblock/stake-service.js");
const { OnChainBadgeRegistry, ownerCommitmentFromSeed } = await import("./badges/onchain.js");
const { newAnonSeed } = await import("./per/token.js");

const port = Number(process.env.API_PORT ?? 3001);
const db = getDb();
const perKeys = getPerKeys();
if (!perKeys.secretKey) {
  throw new Error("PER signing key not available — set PER_DEV_SECRET in dev or wire a real PER signer");
}

// Two networks in play:
//   - mainnetConnection: JUP holdings check + MagicBlock stake-bond submission
//   - badgeConnection:   network where the Anchor badge_registry is deployed
//                        (devnet during the hackathon, mainnet for production)
const mainnetRpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const badgeRpc = process.env.BADGE_RPC_URL ?? mainnetRpc;
const mainnetConnection = new Connection(mainnetRpc, "confirmed");
const badgeConnection = new Connection(badgeRpc, "confirmed");

const evidence = new SolanaEvidenceVerifier(mainnetConnection);

// Optional on-chain badge minting via the deployed badge_registry program.
const onChainRegistry = initOnChainRegistry();

const badgeIssuer = new BadgeIssuer({
  db,
  evidence,
  perSecretKey: perKeys.secretKey,
  perPubkeyBase58: perKeys.publicKeyBase58,
  ...(onChainRegistry
    ? {
        mintBadgeOnChain: async ({ kind }: { kind: string; walletBase58: string }) => {
          // Owner commitment binds the badge to a fresh anon seed without
          // exposing the wallet on-chain.
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

const stakeService = await initStakeService();

const app = createApp({
  db,
  badgeIssuer,
  perPubkeyBase58: perKeys.publicKeyBase58,
  perSecretKey: perKeys.secretKey,
  ...(stakeService ? { stakeService } : {}),
});

app.listen(port, () => {
  console.log(`[api] BlindSol API listening on :${port}`);
  console.log(`[api] mainnet RPC:             ${mainnetRpc}`);
  console.log(`[api] badge program RPC:       ${badgeRpc}`);
  console.log(`[api] PER attestation pubkey:  ${perKeys.publicKeyBase58}`);
  console.log(`[api] MagicBlock stake escrow: ${stakeService ? "ENABLED" : "stubbed"}`);
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

async function initStakeService() {
  if (process.env.MAGICBLOCK_ENABLED !== "true") return undefined;

  const houseSecret = process.env.HOUSE_WALLET_SECRET;
  const stakePool = process.env.STAKE_POOL_PUBKEY;
  if (!houseSecret) {
    console.warn("[api] MAGICBLOCK_ENABLED=true but HOUSE_WALLET_SECRET is missing — stake escrow disabled");
    return undefined;
  }
  if (!stakePool) {
    console.warn("[api] MAGICBLOCK_ENABLED=true but STAKE_POOL_PUBKEY is missing — stake escrow disabled");
    return undefined;
  }

  const houseKeypair = Keypair.fromSecretKey(bs58.decode(houseSecret));
  const cluster = process.env.MAGICBLOCK_CLUSTER ?? "mainnet";
  const client = new MagicBlockClient({
    apiBase: process.env.MAGICBLOCK_API_BASE ?? "https://payments.magicblock.app",
    cluster,
  });

  const usdcMint = new PublicKey(process.env.USDC_MINT ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  const perPostRaw = BigInt(process.env.STAKE_PER_POST_RAW ?? "100000"); // default 0.1 USDC

  const service = new MagicBlockStakeService({
    client,
    connection: mainnetConnection,
    houseKeypair,
    stakePoolPubkey: new PublicKey(stakePool),
    mint: usdcMint,
    perPostAmountRaw: perPostRaw,
    cluster,
    memo: "blindsol-stake-bond",
  });

  try {
    await service.initialize();
    return service;
  } catch (err) {
    console.warn(`[api] MagicBlock stake service init failed: ${(err as Error).message}`);
    console.warn("[api] continuing without stake escrow (posts will still work, but no real USDC moves)");
    return undefined;
  }
}
