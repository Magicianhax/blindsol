-- One-shot rebind of a wallet's existing data from its old random anon
-- to the new deterministic anon. Run AFTER deploying the deterministic
-- derivation code and AFTER applying migration 0005.
--
-- Usage (psql):
--   psql "$DATABASE_URL" \
--     -v old_anon="'anon_OLDXXXXXXXXXX'" \
--     -v new_anon="'anon_NEWXXXXXXXXXX'" \
--     -f apps/api/scripts/rebind-anon.sql
--
-- Where to get the values:
--   - OLD: open the affected device, devtools → localStorage →
--          blindsol_purse_v1 → the badge.anonId field.
--   - NEW: claim a fresh badge in any browser AFTER deploy. The new
--          claim returns the deterministic anonId for the same wallet+kind.
--          Read it from the API claim response or from localStorage.
--
-- Each statement is idempotent — re-running with the same args is a no-op
-- once the rebind has happened.

BEGIN;

-- Audit trail: capture what we're about to change (run-id is a sentinel
-- so you can find this row again in audit_events later).
INSERT INTO audit_events (kind, subject_id, actor_anon_id, badge_kind, meta)
VALUES (
  'badge_issued', -- closest existing kind; we don't add a new enum value just for migrations
  COALESCE(:old_anon, 'unknown'),
  NULL,
  NULL,
  json_build_object(
    'rebind_old_anon', :old_anon,
    'rebind_new_anon', :new_anon,
    'rebind_at', NOW()
  )::text
);

UPDATE usernames     SET anon_id          = :new_anon WHERE anon_id          = :old_anon;
UPDATE posts         SET author_anon_id   = :new_anon WHERE author_anon_id   = :old_anon;
UPDATE comments      SET author_anon_id   = :new_anon WHERE author_anon_id   = :old_anon;
UPDATE reactions     SET reactor_anon_id  = :new_anon WHERE reactor_anon_id  = :old_anon;
UPDATE flags         SET flagger_anon_id  = :new_anon WHERE flagger_anon_id  = :old_anon;

-- The old badge row is now orphaned (its random-seed identity is gone).
-- Leave it in place — there's no foreign-key pressure to delete it and
-- keeping it preserves the audit trail of when it was issued. The new
-- deterministic badge will live in a separate row created at the next
-- claim from the affected wallet.

-- Sanity counts. The CLI prints these so you can spot-check the rebind.
SELECT 'usernames'  AS table_name, count(*) AS rebound FROM usernames     WHERE anon_id         = :new_anon
UNION ALL SELECT 'posts',     count(*) FROM posts        WHERE author_anon_id  = :new_anon
UNION ALL SELECT 'comments',  count(*) FROM comments     WHERE author_anon_id  = :new_anon
UNION ALL SELECT 'reactions', count(*) FROM reactions    WHERE reactor_anon_id = :new_anon
UNION ALL SELECT 'flags',     count(*) FROM flags        WHERE flagger_anon_id = :new_anon;

COMMIT;
