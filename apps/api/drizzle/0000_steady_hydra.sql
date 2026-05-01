CREATE TYPE "public"."reaction_kind" AS ENUM('up', 'down', 'spam');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"on_chain_pubkey" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_anon_id" text NOT NULL,
	"badge_kind" text NOT NULL,
	"content" text NOT NULL,
	"per_attestation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_anon_id" text NOT NULL,
	"badge_kind" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"per_attestation" text NOT NULL,
	"stake_lamports" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"reactor_anon_id" text NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"per_attestation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comments_post" ON "comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_comments_parent" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_posts_author_anon" ON "posts" USING btree ("author_anon_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_posts_badge_created" ON "posts" USING btree ("badge_kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_reactions_post_anon_kind" ON "reactions" USING btree ("post_id","reactor_anon_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reactions_post" ON "reactions" USING btree ("post_id");