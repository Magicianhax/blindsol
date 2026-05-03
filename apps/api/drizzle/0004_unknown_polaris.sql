CREATE TABLE IF NOT EXISTS "usernames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"anon_id" text NOT NULL,
	"badge_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_usernames_username" ON "usernames" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_usernames_anon" ON "usernames" USING btree ("anon_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usernames_badge" ON "usernames" USING btree ("badge_kind");