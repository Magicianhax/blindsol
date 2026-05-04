-- Replace prepared_stake_bonds.from_wallet (plaintext) with from_wallet_hash
-- (sha256 hex). Closes the (wallet, anon_id) leak that was reachable via
-- JOIN posts ON prepared_stake_bonds.post_id = posts.id.
--
-- pgcrypto.digest() takes text and returns bytea; encode(..., 'hex') turns
-- it into the same lowercase hex our app emits with crypto.createHash.

CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint

ALTER TABLE "prepared_stake_bonds" ADD COLUMN IF NOT EXISTS "from_wallet_hash" text;--> statement-breakpoint

-- Backfill existing rows so the new NOT NULL constraint will accept them.
UPDATE "prepared_stake_bonds"
   SET "from_wallet_hash" = encode(digest("from_wallet", 'sha256'), 'hex')
 WHERE "from_wallet_hash" IS NULL;--> statement-breakpoint

ALTER TABLE "prepared_stake_bonds" ALTER COLUMN "from_wallet_hash" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "prepared_stake_bonds" DROP COLUMN IF EXISTS "from_wallet";
