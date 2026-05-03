/**
 * One-shot cleanup: delete rows that are obviously from integration tests
 * — synthetic content_hash like "h1"/"h2", perAttestation "att1"/"att2",
 * or authorAnonId "anon_a"/"anon_b". Idempotent and safe to re-run.
 */
import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

const db = getDb();

async function main() {
  const before = await db.execute(sql`SELECT count(*)::int AS n FROM posts`);
  console.log(`posts before: ${(before.rows[0] as { n: number }).n}`);

  const r = await db.execute(sql`
    DELETE FROM posts
    WHERE content_hash IN ('h1','h2','h3')
       OR per_attestation IN ('att1','att2','att3')
       OR author_anon_id IN ('anon_a','anon_b','anon_c')
    RETURNING id, author_anon_id, content_hash, content
  `);
  console.log(`deleted ${r.rows.length} test fixture(s):`);
  for (const row of r.rows) console.log(" -", row);

  const after = await db.execute(sql`SELECT count(*)::int AS n FROM posts`);
  console.log(`posts after: ${(after.rows[0] as { n: number }).n}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
