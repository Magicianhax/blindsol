import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const { Connection } = await import("@solana/web3.js");
const { createApp } = await import("./app.js");
const { getDb } = await import("./db/index.js");
const { getPerKeys } = await import("./per/keys.js");
const { SolanaEvidenceVerifier } = await import("./per/evidence.js");
const { BadgeIssuer } = await import("./per/issuer.js");

const port = Number(process.env.API_PORT ?? 3001);
const db = getDb();
const perKeys = getPerKeys();
if (!perKeys.secretKey) {
  throw new Error("PER signing key not available — set PER_DEV_SECRET in dev or wire a real PER signer");
}

const connection = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
const evidence = new SolanaEvidenceVerifier(connection);
const badgeIssuer = new BadgeIssuer({
  db,
  evidence,
  perSecretKey: perKeys.secretKey,
  perPubkeyBase58: perKeys.publicKeyBase58,
});

const app = createApp({
  db,
  badgeIssuer,
  perPubkeyBase58: perKeys.publicKeyBase58,
  perSecretKey: perKeys.secretKey,
});

app.listen(port, () => {
  console.log(`[api] BlindSol API listening on :${port}`);
  console.log(`[api] PER attestation pubkey: ${perKeys.publicKeyBase58}`);
});
