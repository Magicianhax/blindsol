/**
 * Print a snapshot of every table's current row count + the data shape
 * so you can verify what's in prod and what's been touched.
 */
import "dotenv/config";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env") });

import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";

async function main() {
  const db = getDb();
  const tables = [
    "badges",
    "posts",
    "comments",
    "reactions",
    "flags",
    "audit_events",
    "prepared_stake_bonds",
  ];

  console.log("\n=== row counts ===");
  for (const t of tables) {
    const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM ${t}`));
    console.log(`  ${t.padEnd(24)} ${(r.rows[0] as any).n}`);
  }

  console.log("\n=== posts (current) ===");
  const posts = await db.execute(sql`
    SELECT id, author_anon_id, badge_kind, title, LEFT(content, 60) AS content,
           up_count, down_count, comment_count, created_at
    FROM posts ORDER BY created_at DESC
  `);
  for (const r of posts.rows) console.log(" ", r);

  console.log("\n=== comments (current) ===");
  const comments = await db.execute(sql`
    SELECT id, post_id, author_anon_id, badge_kind, LEFT(content, 60) AS content, created_at
    FROM comments ORDER BY created_at DESC
  `);
  for (const r of comments.rows) console.log(" ", r);

  console.log("\n=== reactions (current) ===");
  const reactions = await db.execute(sql`
    SELECT id, post_id, comment_id, kind, reactor_anon_id, created_at
    FROM reactions ORDER BY created_at DESC
  `);
  for (const r of reactions.rows) console.log(" ", r);

  console.log("\n=== last 5 audit events ===");
  const audit = await db.execute(sql`
    SELECT kind, subject_id, badge_kind, meta, created_at
    FROM audit_events ORDER BY created_at DESC LIMIT 5
  `);
  for (const r of audit.rows) console.log(" ", r);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
