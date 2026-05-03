import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const db = getDb();

async function main() {
  const cols = await db.execute(sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('posts','reactions')
    ORDER BY table_name, ordinal_position
  `);
  console.log("--- columns ---");
  for (const r of cols.rows) console.log(r.table_name, r.column_name, r.data_type, "nullable:" + r.is_nullable);

  const idx = await db.execute(sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename='reactions'
    ORDER BY indexname
  `);
  console.log("\n--- reactions indexes ---");
  for (const r of idx.rows) console.log(r.indexname, "::", r.indexdef);

  const checks = await db.execute(sql`
    SELECT con.conname, pg_get_constraintdef(con.oid) as def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname='reactions' AND con.contype='c'
  `);
  console.log("\n--- reactions check constraints ---");
  for (const r of checks.rows) console.log(r.conname, "::", r.def);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
