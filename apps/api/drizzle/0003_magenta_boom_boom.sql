CREATE TABLE IF NOT EXISTS "prepared_stake_bonds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"from_wallet" text NOT NULL,
	"content_hash" text NOT NULL,
	"expected_amount_raw" text NOT NULL,
	"expected_recipient" text NOT NULL,
	"memo" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prepared_stake_bonds_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_prep_expires" ON "prepared_stake_bonds" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN IF EXISTS "stake_tx_signature";