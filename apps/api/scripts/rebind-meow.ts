import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

/**
 * One-shot rebind for the @meow user. Consolidates:
 *   - random-anon `anon_e81f5a0a5df241c9` (the @meow username + 1 post + 2 comments)
 *   - random-anon `anon_6af66fe91e246260` (orphan post from an earlier claim)
 * onto the new deterministic anon `anon_06495a9d11e322d5`.
 *
 * Reactions are deduped before update because the (target, anon, kind)
 * unique constraint would block merging two anons that voted on the same
 * post+kind. We keep the oldest reaction and drop the rest.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, "../../../.env") });

const NEW_ANON = "anon_06495a9d11e322d5";
const OLD_ANONS = ["anon_e81f5a0a5df241c9", "anon_6af66fe91e246260"];
const ALL_ANONS = [...OLD_ANONS, NEW_ANON];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO audit_events (kind, subject_id, actor_anon_id, badge_kind, meta)
       VALUES ('badge_issued', $1, NULL, 'jup_holder', $2)`,
      [
        NEW_ANON,
        JSON.stringify({
          rebind_old_anons: OLD_ANONS,
          rebind_new_anon: NEW_ANON,
          rebind_at: new Date().toISOString(),
          note: "consolidate random-seed anons onto deterministic anon for @meow",
        }),
      ],
    );

    // Dedupe reactions across the merging anons. For each (target, kind)
    // tuple, keep the oldest row (lowest created_at) and delete others.
    // Targets are polymorphic post_id OR comment_id; group on COALESCE.
    const deduped = await client.query(
      `DELETE FROM reactions
       WHERE reactor_anon_id = ANY($1::text[])
         AND id NOT IN (
           SELECT DISTINCT ON (kind, COALESCE(post_id::text, ''), COALESCE(comment_id::text, ''))
             id
           FROM reactions
           WHERE reactor_anon_id = ANY($1::text[])
           ORDER BY kind, COALESCE(post_id::text, ''), COALESCE(comment_id::text, ''), created_at ASC
         )`,
      [ALL_ANONS],
    );

    const u = await client.query(
      `UPDATE usernames SET anon_id = $1 WHERE anon_id = ANY($2::text[]) RETURNING username`,
      [NEW_ANON, OLD_ANONS],
    );
    const p = await client.query(
      `UPDATE posts SET author_anon_id = $1 WHERE author_anon_id = ANY($2::text[]) RETURNING id`,
      [NEW_ANON, OLD_ANONS],
    );
    const c = await client.query(
      `UPDATE comments SET author_anon_id = $1 WHERE author_anon_id = ANY($2::text[]) RETURNING id`,
      [NEW_ANON, OLD_ANONS],
    );
    const r = await client.query(
      `UPDATE reactions SET reactor_anon_id = $1 WHERE reactor_anon_id = ANY($2::text[]) RETURNING id`,
      [NEW_ANON, OLD_ANONS],
    );

    await client.query("COMMIT");
    console.log(`[rebind] reactions deduped:  ${deduped.rowCount}`);
    console.log(`[rebind] usernames updated:  ${u.rowCount}`);
    console.log(`[rebind] posts updated:      ${p.rowCount}`);
    console.log(`[rebind] comments updated:   ${c.rowCount}`);
    console.log(`[rebind] reactions updated:  ${r.rowCount}`);
    console.log(`[rebind] new anon:           ${NEW_ANON}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
