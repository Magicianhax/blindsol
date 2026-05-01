import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

/**
 * Privacy audit. Walks every row in every public table and looks for any
 * column that looks like a Solana wallet (base58, 32-44 chars, mostly
 * alphanumeric). If something resembles a wallet anywhere outside the
 * `on_chain_pubkey` column on `badges`, we have a leak.
 */

const SOL_PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ALLOWED_PUBKEY_COLUMNS = new Set<string>([
  "badges.on_chain_pubkey", // public on-chain badge mint — fine to expose
]);

async function main(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const tables = (
      await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_type='BASE TABLE'
           AND table_name NOT LIKE '\\_%'
         ORDER BY table_name`,
      )
    ).rows.map((r) => r.table_name);

    let totalRows = 0;
    let suspiciousColumns: Array<{ table: string; column: string; sample: string }> = [];

    for (const t of tables) {
      const cols = (
        await pool.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema='public' AND table_name=$1`,
          [t],
        )
      ).rows.map((r) => r.column_name);

      const rows = (await pool.query(`SELECT * FROM "${t}"`)).rows;
      totalRows += rows.length;
      console.log(`\n[audit] ${t}: ${rows.length} rows, columns: ${cols.join(", ")}`);

      for (const row of rows) {
        for (const col of cols) {
          const v = row[col];
          if (typeof v !== "string") continue;
          if (!SOL_PUBKEY.test(v)) continue;
          const fq = `${t}.${col}`;
          if (ALLOWED_PUBKEY_COLUMNS.has(fq)) continue;
          suspiciousColumns.push({ table: t, column: col, sample: v });
          break;
        }
      }
    }

    console.log(`\n[audit] scanned ${totalRows} rows across ${tables.length} tables`);
    if (suspiciousColumns.length === 0) {
      console.log("[audit] CLEAN — no wallet-shaped values found in any forbidden column");
    } else {
      console.log("[audit] LEAKS FOUND:");
      for (const s of suspiciousColumns) {
        console.log(`  ${s.table}.${s.column}: ${s.sample}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
