import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

/**
 * Apply a single .sql file to the configured DATABASE_URL.
 *
 * Usage: pnpm exec tsx scripts/apply-sql.ts <path-to-sql>
 *
 * Idempotent statements (CREATE IF NOT EXISTS, ALTER ADD COLUMN IF NOT EXISTS)
 * are safe to re-run. Used to apply hand-written migrations that aren't in the
 * Drizzle journal.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const file = process.argv[2];
if (!file) {
  console.error("usage: apply-sql.ts <path>");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");

// Drizzle migrations include `--> statement-breakpoint` markers between
// statements. Split on those, fall back to running the whole file as one
// statement if no markers are present.
const stmts = sql.includes("--> statement-breakpoint")
  ? sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)
  : [sql];

const pool = new Pool({ connectionString: url });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const stmt of stmts) {
      console.log(`[apply-sql] running statement (${stmt.length} chars)`);
      await client.query(stmt);
    }
    await client.query("COMMIT");
    console.log(`[apply-sql] applied ${stmts.length} statement(s) from ${file}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
