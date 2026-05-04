-- Deterministic anon derivation + cross-device sign-in.
--
-- 1. badges.anon_id — populated by the issuer from HMAC(perSecret, wallet||kind)
--    so sign-in can look up "what badges does this wallet hold?" without
--    ever persisting the wallet itself.
-- 2. auth_challenges — single-use nonces for the sign-with-wallet flow.

ALTER TABLE "badges" ADD COLUMN IF NOT EXISTS "anon_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_badges_anon" ON "badges" USING btree ("anon_id") WHERE "anon_id" IS NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nonce" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_auth_challenges_nonce" ON "auth_challenges" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_challenges_expires" ON "auth_challenges" USING btree ("expires_at");
