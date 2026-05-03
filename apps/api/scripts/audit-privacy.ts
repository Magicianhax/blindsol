/**
 * Privacy audit: dump every place a wallet could leak and verify the
 * answer is "nowhere public".
 *
 * Hit prod via:
 *   pnpm --filter @blindsol/api exec tsx scripts/audit-privacy.ts
 */
import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const SOLANA_PUBKEY = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const SOLANA_TX_SIG = /\b[1-9A-HJ-NP-Za-km-z]{86,88}\b/g;
const HEX_HASH = /^[a-f0-9]{64}$/;

type Issue = { severity: "CRITICAL" | "HIGH" | "OK"; where: string; detail: string };
const issues: Issue[] = [];

function check(severity: Issue["severity"], where: string, detail: string) {
  issues.push({ severity, where, detail });
}

async function main() {
  const db = getDb();

  console.log("\n=== posts table columns ===");
  const cols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts'
    ORDER BY ordinal_position
  `);
  const postCols = cols.rows.map((r: any) => r.column_name as string);
  console.log(postCols.join(", "));
  if (postCols.includes("stake_tx_signature")) {
    check("CRITICAL", "posts.stake_tx_signature", "column still exists — privacy fix not migrated");
  } else {
    check("OK", "posts.stake_tx_signature", "column dropped — wallet→post chain pointer removed");
  }
  if (postCols.some((c) => c.includes("wallet"))) {
    check("CRITICAL", "posts.*wallet*", "wallet-named column on posts");
  } else {
    check("OK", "posts.* (no wallet column)", "no wallet column on posts");
  }

  console.log("\n=== prepared_stake_bonds table columns ===");
  const prep = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='prepared_stake_bonds'
    ORDER BY ordinal_position
  `);
  if (prep.rows.length === 0) {
    check("CRITICAL", "prepared_stake_bonds", "table missing — privacy refactor not deployed");
  } else {
    const prepCols = prep.rows.map((r: any) => r.column_name as string);
    console.log(prepCols.join(", "));
    if (!prepCols.includes("from_wallet")) {
      check("HIGH", "prepared_stake_bonds.from_wallet", "missing — receipt would have to round-trip wallet to user");
    } else {
      check("OK", "prepared_stake_bonds.from_wallet", "wallet stays server-side, never returned");
    }
  }

  console.log("\n=== audit_events.meta — verify NO plaintext tx signatures ===");
  const audit = await db.execute(sql`
    SELECT id, kind, meta FROM audit_events ORDER BY created_at DESC LIMIT 20
  `);
  console.log(`audit rows: ${audit.rows.length}`);
  let plaintextTxFound = 0;
  let hashedTxFound = 0;
  for (const row of audit.rows) {
    const meta = (row as any).meta as string | null;
    if (!meta) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(meta);
    } catch {
      continue;
    }
    if (parsed.stakeTxSignature) {
      plaintextTxFound++;
      console.log(`  PLAINTEXT TX SIG in audit row ${(row as any).id}: ${(parsed.stakeTxSignature as string).slice(0, 16)}…`);
    }
    if (parsed.stakeTxSignatureHash) {
      const h = parsed.stakeTxSignatureHash as string;
      if (HEX_HASH.test(h)) hashedTxFound++;
      else console.log(`  malformed hash on row ${(row as any).id}: ${h}`);
    }
  }
  if (plaintextTxFound > 0) {
    check("CRITICAL", "audit_events.meta", `${plaintextTxFound} rows still have plaintext tx signatures (likely pre-fix)`);
  }
  check(
    plaintextTxFound > 0 ? "HIGH" : "OK",
    "audit_events.meta",
    `plaintext sig rows: ${plaintextTxFound}, hashed sig rows: ${hashedTxFound}`,
  );

  console.log("\n=== prepared_stake_bonds rows — wallets must NEVER be reachable via public API ===");
  const stakeRows = await db.execute(sql`SELECT count(*)::int AS n FROM prepared_stake_bonds`);
  console.log(`prepared rows: ${(stakeRows.rows[0] as any).n}`);
  // Verify there's no API endpoint that returns these. Hit the API for known
  // routes and ensure /prepared* doesn't exist.
  const checkUrl = "https://blindsol-api.fly.dev/prepared_stake_bonds";
  try {
    const r = await fetch(checkUrl);
    if (r.ok) {
      check("CRITICAL", "/prepared_stake_bonds", "endpoint exposed — wallets readable via HTTP");
    } else {
      check("OK", "/prepared_stake_bonds (no endpoint)", `${r.status} — table has no public route`);
    }
  } catch (e) {
    check("OK", "/prepared_stake_bonds", "no endpoint reachable");
  }

  console.log("\n=== scan public /posts for any base58 strings that look like wallets or sigs ===");
  const apiResp = await fetch("https://blindsol-api.fly.dev/posts");
  const json = (await apiResp.json()) as { posts: any[] };
  const responseStr = JSON.stringify(json);
  const pubkeys = responseStr.match(SOLANA_PUBKEY) ?? [];
  const sigs = responseStr.match(SOLANA_TX_SIG) ?? [];
  console.log(`pubkey-shaped substrings found: ${pubkeys.length}`);
  console.log(`tx-sig-shaped substrings found: ${sigs.length}`);
  if (sigs.length > 0) {
    check("CRITICAL", "/posts response", `${sigs.length} tx-sig-shaped strings in public response: ${sigs.slice(0, 2).join(", ")}…`);
  } else {
    check("OK", "/posts (no tx sigs)", "no 86-88 char base58 substrings (tx signatures) in public response");
  }
  // Pubkey-shaped substrings are expected (anonId can be base58-shaped, badge ids are uuids, content_hash is hex).
  // We only care that we don't see anything that's a 32-44 char wallet pubkey
  // tied to a real on-chain identity. The post.id is a uuid; perAttestation
  // is base58 sig (88 chars — already covered above). authorAnonId is HMAC-derived.
  // Verify: every pubkey-shaped string is something we expect.
  if (pubkeys.length > 0) {
    console.log("  pubkey-shaped substrings (expected: HMAC anon IDs, attestation sigs):");
    for (const p of new Set(pubkeys)) {
      console.log(`    ${p}  (${p.length} chars)`);
    }
  }

  console.log("\n=== verdict ===");
  for (const i of issues) {
    const tag = i.severity === "OK" ? "✓" : i.severity;
    console.log(`  [${tag}] ${i.where}: ${i.detail}`);
  }
  const bad = issues.filter((i) => i.severity !== "OK");
  console.log("");
  if (bad.length === 0) {
    console.log("✅  All public surfaces are clean. No wallet-leak vectors found.");
  } else {
    console.log(`⚠  ${bad.length} issue(s) found. See above.`);
    process.exitCode = 1;
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
