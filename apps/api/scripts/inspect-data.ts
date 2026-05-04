import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

/** Read-only inspection of usernames + post counts per anon. Uses DATABASE_URL. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const usernames = await pool.query(
    `SELECT username, anon_id, badge_kind, created_at
     FROM usernames
     ORDER BY created_at DESC`,
  );
  console.log(`\n=== usernames (${usernames.rowCount}) ===`);
  for (const r of usernames.rows) {
    console.log(`  @${r.username}  ${r.anon_id}  ${r.badge_kind}  ${r.created_at.toISOString()}`);
  }

  const postCounts = await pool.query(
    `SELECT author_anon_id, badge_kind, count(*)::int AS posts
     FROM posts
     GROUP BY author_anon_id, badge_kind
     ORDER BY posts DESC`,
  );
  console.log(`\n=== anons with posts (${postCounts.rowCount}) ===`);
  for (const r of postCounts.rows) {
    console.log(`  ${r.author_anon_id}  ${r.badge_kind}  ${r.posts} posts`);
  }

  const commentCounts = await pool.query(
    `SELECT author_anon_id, badge_kind, count(*)::int AS comments
     FROM comments
     GROUP BY author_anon_id, badge_kind
     ORDER BY comments DESC`,
  );
  console.log(`\n=== anons with comments (${commentCounts.rowCount}) ===`);
  for (const r of commentCounts.rows) {
    console.log(`  ${r.author_anon_id}  ${r.badge_kind}  ${r.comments} comments`);
  }

  const badges = await pool.query(
    `SELECT id, kind, anon_id, issued_at FROM badges ORDER BY issued_at DESC LIMIT 30`,
  );
  console.log(`\n=== badges (most recent 30 of ${badges.rowCount}) ===`);
  for (const r of badges.rows) {
    console.log(
      `  ${r.id.slice(0, 8)}…  ${r.kind}  anon_id=${r.anon_id ?? "<null>"}  ${r.issued_at.toISOString()}`,
    );
  }
} finally {
  await pool.end();
}
